// chat.js - client logic
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
let typingTimeoutId = null;


function addMessageHtml(html) {
    const div = document.createElement('div');
    div.classList.add('message');
    div.innerHTML = html;
    messagesListEl.appendChild(div);
    messagesListEl.scrollTop = messagesListEl.scrollHeight;
}

connection.on("ReceivePublicMessage", (user, message, isoDate) => {
    const dt = new Date(isoDate).toLocaleTimeString();
    addMessageHtml(`<div><strong>${escapeHtml(user)}</strong> <span class="meta">(${dt})</span><div>${escapeHtml(message)}</div></div>`);
});

connection.on("ReceivePrivateMessage", (fromUser, toUser, message, isoDate) => {
    const dt = new Date(isoDate).toLocaleTimeString();
    const me = myUsername;
    const isForMe = (toUser === me) || (fromUser === me);
    if (!isForMe) return;
    const who = fromUser === me ? `You ➜ ${toUser}` : `${fromUser} ➜ You`;
    addMessageHtml(`<div><strong>${escapeHtml(who)}</strong> <span class="meta">(${dt})</span><div>${escapeHtml(message)}</div></div>`);
});

connection.on("UserList", (users) => {
    renderUsers(users);
});

connection.on("UserJoined", (username) => {
    addMessageHtml(`<div><em>${escapeHtml(username)} joined</em></div>`);
});

connection.on("UserLeft", (username) => {
    addMessageHtml(`<div><em>${escapeHtml(username)} left</em></div>`);
});

connection.on("Registered", (username) => {
    myUsername = username;
    currentUserLabel.textContent = `You: ${username}`;
});

connection.on("UserTyping", (fromUser, toUser) => {
    // Show only if it's relevant to the CURRENT chat
    if (!typingIndicator) return;

    // public chat typing (toUser == null)
    if (!toUser && selectedUser === null) {
        showTyping(`${fromUser} is typing...`);
    }

    // private chat typing
    if (toUser && selectedUser === fromUser) {
        showTyping(`${fromUser} is typing...`);
    }
});

function showTyping(text) {
    typingIndicator.textContent = text;

    // clear previous timeout
    if (typingTimeoutId) {
        clearTimeout(typingTimeoutId);
    }

    // hide after 2 seconds of no new typing events
    typingTimeoutId = setTimeout(() => {
        typingIndicator.textContent = "";
    }, 2000);
}


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

document.getElementById('btnRegister').addEventListener('click', async () => {
    const name = document.getElementById('usernameInput').value.trim();
    if (!name) { alert('Enter a name'); return; }
    await connection.invoke('Register', name);
});

document.getElementById('btnSend').addEventListener('click', async () => {
    const msg = document.getElementById('messageInput').value.trim();
    if (!msg) return;
    if (!myUsername) { alert('Set your name first'); return; }
    if (selectedUser) {
        await connection.invoke('SendPrivateMessage', myUsername, selectedUser, msg);
    } else {
        await connection.invoke('SendPublicMessage', myUsername, msg);
    }
    document.getElementById('messageInput').value = '';
});

document.getElementById('btnSendPrivate').addEventListener('click', async () => {
    if (!selectedUser) { alert('Select a user to message privately'); return; }
    const msg = document.getElementById('messageInput').value.trim();
    if (!msg) return;
    await connection.invoke('SendPrivateMessage', myUsername, selectedUser, msg);
    document.getElementById('messageInput').value = '';
});

function renderUsers(users) {
    usersListEl.innerHTML = '';
    users.forEach(u => {
        const div = document.createElement('div');
        div.classList.add('contact');
        div.textContent = u;
        div.dataset.username = u;
        if (u === selectedUser) div.classList.add('selected');
        div.addEventListener('click', async () => {
            if (u === selectedUser) {
                selectedUser = null;
                chatTitle.textContent = 'Public Chat';
                // load public history
                await loadHistory(null);
            } else {
                selectedUser = u;
                chatTitle.textContent = `Chat with ${u} (private)`;
                await loadHistory(u);
            }
            renderUsers(users);
        });
        usersListEl.appendChild(div);
    });

    const pub = document.createElement('div');
    pub.textContent = 'Public (everyone)';
    pub.classList.add('contact');
    if (selectedUser === null) pub.classList.add('selected');
    pub.addEventListener('click', async () => {
        selectedUser = null;
        chatTitle.textContent = 'Public Chat';
        await loadHistory(null);
        renderUsers(users);
    });
    usersListEl.insertBefore(pub, usersListEl.firstChild);
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

// Load last 50 messages for conversation (null => public)
async function loadHistory(withUser) {
    try {
        const msgs = await connection.invoke('GetConversationHistory', withUser);
        messagesListEl.innerHTML = '';
        msgs.forEach(m => {
            const dt = new Date(m.timestamp).toLocaleTimeString();
            if (m.toUser) {
                const who = m.fromUser === myUsername ? `You ➜ ${m.toUser}` : `${m.fromUser} ➜ You`;
                addMessageHtml(`<div><strong>${escapeHtml(who)}</strong> <span class="meta">(${dt})</span><div>${escapeHtml(m.body)}</div></div>`);
            } else {
                addMessageHtml(`<div><strong>${escapeHtml(m.fromUser)}</strong> <span class="meta">(${dt})</span><div>${escapeHtml(m.body)}</div></div>`);
            }
        });
    } catch (err) {
        console.error('Failed to load history', err);
    }
}

// --- Typing indicator sender ---

const messageInput = document.getElementById('messageInput');
let lastTypingSentAt = 0;

messageInput?.addEventListener('input', async () => {
    const now = Date.now();
    // throttle to once every 700ms to avoid spamming the hub
    if (now - lastTypingSentAt < 700) return;
    lastTypingSentAt = now;

    try {
        const toUser = selectedUser; // null => public chat
        await connection.invoke('Typing', toUser);
    } catch (err) {
        console.error('Error sending typing event:', err);
    }
});

