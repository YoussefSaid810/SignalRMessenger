// chat.js - SignalR chat with bubbles, manual username + typing

const connection = new signalR.HubConnectionBuilder()
    .withUrl("/chatHub")
    .withAutomaticReconnect()
    .build();

let myUsername = null;
let selectedUser = null;

const usersListEl = document.getElementById('usersList');
const messagesListEl = document.getElementById('messagesList');
const chatTitle = document.getElementById('chatTitle');
const currentUserLabel = document.getElementById('currentUserLabel');
const typingIndicator = document.getElementById('typingIndicator');
const messageInput = document.getElementById('messageInput');

let typingTimeoutId = null;
let lastTypingSentAt = 0;

let currentUsers = []; // cache last user list from server
const lastOutgoingStatusSpan = {};

// conversationMeta["public"] = { preview, time }
// conversationMeta["user:ahmed"] = { preview, time }
const conversationMeta = {};


// ========== Helpers ==========
// Already used for sidebar previews
function formatTimeShort(isoDate) {
    if (!isoDate) return "";
    const d = new Date(isoDate);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// New: nicer timestamps for bubbles: "Today", "Yesterday", "3/15 02:10"
function formatTimePretty(isoDate) {
    if (!isoDate) return "";

    const d = new Date(isoDate);
    const now = new Date();

    const sameDay = (a, b) =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();

    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);

    const timePart = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (sameDay(d, now)) {
        return `Today ${timePart}`;
    } else if (sameDay(d, yesterday)) {
        return `Yesterday ${timePart}`;
    } else {
        const datePart = d.toLocaleDateString();
        return `${datePart} ${timePart}`;
    }
}

function formatTimeShort(isoDate) {
    if (!isoDate) return "";
    const d = new Date(isoDate);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Update preview + time for a conversation
function updateConversationMeta(key, body, isoDate) {
    if (!body) return;

    const trimmed = body.length > 30 ? body.slice(0, 30) + "…" : body;
    conversationMeta[key] = {
        preview: trimmed,
        time: formatTimeShort(isoDate)   
    };

    renderUsers(currentUsers);
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

// system messages (join/leave, etc.)
function addSystemMessage(text) {
    const div = document.createElement('div');
    div.classList.add('message');
    div.innerHTML = `<em>${escapeHtml(text)}</em>`;
    messagesListEl.appendChild(div);
    messagesListEl.scrollTop = messagesListEl.scrollHeight;
}

// chat bubbles
function addMessageBubble(from, to, body, isoDate) {
    if (!messagesListEl) return;

    const isYou = myUsername && from === myUsername;
    const row = document.createElement('div');
    row.classList.add('message-row');
    row.classList.add(isYou ? 'you' : 'other');

    const bubble = document.createElement('div');
    bubble.classList.add('message-bubble');

    const textDiv = document.createElement('div');
    textDiv.textContent = body;
    bubble.appendChild(textDiv);

    const meta = document.createElement('div');
    meta.classList.add('message-meta');

    const dt = formatTimePretty(isoDate); // using the pretty formatter

    let label;
    if (to) {
        // private
        if (isYou) {
            label = `You ➜ ${to}`;
        } else if (to === myUsername) {
            label = `${from} ➜ You`;
        } else {
            label = `${from} ➜ ${to}`;
        }
    } else {
        // public
        label = from;
    }

    meta.textContent = dt ? `${label} • ${dt}` : label;

    // ✅ add delivery indicator for *outgoing private* messages
    if (isYou && to) {
        const statusSpan = document.createElement('span');
        statusSpan.classList.add('delivery-indicator');
        statusSpan.textContent = ' ✓✓ Delivered';
        meta.appendChild(statusSpan);

        // conversation key = "user:otherUser"
        const key = 'user:' + to;
        lastOutgoingStatusSpan[key] = statusSpan;
    }

    bubble.appendChild(meta);
    row.appendChild(bubble);
    messagesListEl.appendChild(row);
    messagesListEl.scrollTop = messagesListEl.scrollHeight;
}

// typing indicator text
function showTyping(text) {
    if (!typingIndicator) return;
    typingIndicator.textContent = text;

    if (typingTimeoutId) {
        clearTimeout(typingTimeoutId);
    }

    typingTimeoutId = setTimeout(() => {
        typingIndicator.textContent = "";
    }, 2000);
}

// render users list
function renderUsers(users) {
    if (!usersListEl) return;

    currentUsers = users.slice(); // keep a copy for meta updates
    usersListEl.innerHTML = '';

    // ----- Public chat item -----
    const pubMeta = conversationMeta["public"];

    const pub = document.createElement('div');
    pub.classList.add('contact');
    pub.dataset.username = "";

    pub.innerHTML = `
        <div class="contact-avatar">P</div>
        <div class="contact-main">
            <div class="contact-top-row contact-label">Public (everyone)</div>
            <div class="contact-last-message">
                ${pubMeta ? escapeHtml(pubMeta.preview) : ''}
                ${pubMeta && pubMeta.time ? ' · ' + escapeHtml(pubMeta.time) : ''}
            </div>
            <div class="contact-status-row">
                <span class="status-dot" style="background:#bbb;"></span>
                <span class="status-text" style="color:#777;">ROOM</span>
            </div>
        </div>
    `;

    if (selectedUser === null) pub.classList.add('selected');

    pub.addEventListener('click', async () => {
        selectedUser = null;
        if (chatTitle) chatTitle.textContent = 'Public Chat';
        await loadHistory(null);
        renderUsers(users);
    });

    usersListEl.appendChild(pub);

    // ----- Other users -----
    users.forEach(u => {
        const div = document.createElement('div');
        div.classList.add('contact');
        div.dataset.username = u;

        const initials = (u || "?").trim().charAt(0).toUpperCase() || "?";
        const key = "user:" + u;
        const meta = conversationMeta[key];

        div.innerHTML = `
            <div class="contact-avatar">${escapeHtml(initials)}</div>
            <div class="contact-main">
                <div class="contact-top-row contact-label">${escapeHtml(u)}</div>
                <div class="contact-last-message">
                    ${meta ? escapeHtml(meta.preview) : ''}
                    ${meta && meta.time ? ' · ' + escapeHtml(meta.time) : ''}
                </div>
                <div class="contact-status-row">
                    <span class="status-dot"></span>
                    <span class="status-text">ONLINE</span>
                </div>
            </div>
        `;

        if (u === selectedUser) div.classList.add('selected');

        div.addEventListener('click', async () => {
            if (u === selectedUser) {
                selectedUser = null;
                if (chatTitle) chatTitle.textContent = 'Public Chat';
                await loadHistory(null);
            } else {
                selectedUser = u;
                if (chatTitle) chatTitle.textContent = `Chat with ${u} (private)`;
                await loadHistory(u);
                await notifySeen(u); // 👈 mark messages as seen
            }
            renderUsers(users);
        });

        usersListEl.appendChild(div);
    });
}


// load last 50 messages for current conversation
async function loadHistory(withUser) {
    try {
        const msgs = await connection.invoke('GetConversationHistory', withUser);
        if (!messagesListEl) return;

        messagesListEl.innerHTML = '';

        let lastBody = null;
        let lastTs = null;

        msgs.forEach(m => {
            const ts = m.timestamp || m.Timestamp;
            const from = m.fromUser || m.FromUser;
            const to = m.toUser || m.ToUser;
            const body = m.body || m.Body;

            addMessageBubble(from, to, body, ts);
            lastBody = body;
            lastTs = ts;
        });

        // after rendering, update preview for that conversation
        if (lastBody && lastTs) {
            if (!withUser) {
                updateConversationMeta("public", lastBody, lastTs);
            } else {
                const key = "user:" + withUser;
                updateConversationMeta(key, lastBody, lastTs);
            }
        }

    } catch (err) {
        console.error('Failed to load history', err);
    }
}

async function notifySeen(otherUser) {
    if (!otherUser || !myUsername) return;
    try {
        await connection.invoke('MarkConversationSeen', otherUser);
    } catch (err) {
        console.error('Error sending seen notification:', err);
    }
}


// ========== SignalR handlers ==========

connection.on("ReceivePublicMessage", (user, message, isoDate) => {
    addMessageBubble(user, null, message, isoDate);
    updateConversationMeta("public", message, isoDate);
});


connection.on("ReceivePrivateMessage", (fromUser, toUser, message, isoDate) => {
    const me = myUsername;
    const isForMe = (toUser === me) || (fromUser === me);
    if (!isForMe) return;

    addMessageBubble(fromUser, toUser, message, isoDate);
    // If this is a message *to me* and I currently have this conversation open,
    // immediately tell the sender it's seen.
    if (toUser === myUsername && selectedUser === fromUser) {
        notifySeen(fromUser);
    }

    // preview is based on "the other person"
    const other = fromUser === me ? toUser : fromUser;
    const key = "user:" + other;
    updateConversationMeta(key, message, isoDate);
});

connection.on("UserList", (users) => {
    console.log("UserList from server:", users);
    renderUsers(users);
});

connection.on("UserJoined", (username) => {
    addSystemMessage(`${username} joined`);
});

connection.on("UserLeft", (username) => {
    addSystemMessage(`${username} left`);
});

connection.on("Registered", (username) => {
    myUsername = username;
    if (currentUserLabel) {
        currentUserLabel.textContent = `You: ${username}`;
    }
    // Load public history after registration
    loadHistory(null);
});

// typing notifications from server
connection.on("UserTyping", (fromUser, toUser) => {
    if (!typingIndicator) return;

    // public typing
    if (!toUser && selectedUser === null) {
        showTyping(`${fromUser} is typing...`);
    }

    // private typing (chat with that user selected)
    if (toUser && selectedUser === fromUser) {
        showTyping(`${fromUser} is typing...`);
    }
});
connection.on("ConversationSeen", (byUser) => {
    const key = 'user:' + byUser;
    const span = lastOutgoingStatusSpan[key];
    if (!span) return;

    span.textContent = ' ✓✓ Seen';
    span.classList.add('seen'); // turns it green via CSS
});


// ========== Start connection ==========

async function start() {
    try {
        await connection.start();
        console.log("Connected to chatHub");
    } catch (err) {
        console.error(err);
        setTimeout(start, 2000);
    }
}
start();

// ========== DOM events ==========

// Register username
document.getElementById('btnRegister')?.addEventListener('click', async () => {
    const input = document.getElementById('usernameInput');
    const name = input.value.trim();
    if (!name) {
        alert('Enter a name');
        return;
    }
    try {
        await connection.invoke('Register', name);
    } catch (err) {
        console.error('Error registering user:', err);
    }
});

// Send message (public or private)
document.getElementById('btnSend')?.addEventListener('click', async () => {
    const msg = messageInput.value.trim();
    if (!msg) return;

    if (!myUsername) {
        alert('Set your name first');
        return;
    }

    try {
        if (selectedUser) {
            await connection.invoke('SendPrivateMessage', myUsername, selectedUser, msg);
        } else {
            await connection.invoke('SendPublicMessage', myUsername, msg);
        }
        messageInput.value = '';
    } catch (err) {
        console.error('Error sending message:', err);
    }
});

// Explicit private send button
document.getElementById('btnSendPrivate')?.addEventListener('click', async () => {
    if (!selectedUser) {
        alert('Select a user to message privately');
        return;
    }

    const msg = messageInput.value.trim();
    if (!msg) return;

    if (!myUsername) {
        alert('Set your name first');
        return;
    }

    try {
        await connection.invoke('SendPrivateMessage', myUsername, selectedUser, msg);
        messageInput.value = '';
    } catch (err) {
        console.error('Error sending private message:', err);
    }
});

// Typing events
messageInput?.addEventListener('input', async () => {
    const now = Date.now();
    if (now - lastTypingSentAt < 700) return; // throttle
    lastTypingSentAt = now;

    try {
        const toUser = selectedUser; // null => public
        await connection.invoke('Typing', toUser);
    } catch (err) {
        console.error('Error sending typing event:', err);
    }
});
