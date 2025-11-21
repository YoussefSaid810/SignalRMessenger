using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using SignalRMessenger.Data;
using SignalRMessenger.Models;

namespace SignalRMessenger.Hubs
{
    public class ChatHub : Hub
    {
        private readonly ApplicationDbContext _db;

        // username -> connectionIds
        private static readonly ConcurrentDictionary<string, ConcurrentBag<string>> _users =
            new(StringComparer.OrdinalIgnoreCase);

        // connectionId -> username
        private static readonly ConcurrentDictionary<string, string> _connections =
            new();

        public ChatHub(ApplicationDbContext db)
        {
            _db = db;
        }

        // -------- helper: always send fresh user list --------
        private Task BroadcastUserList()
        {
            var users = _users.Keys.OrderBy(u => u).ToList();
            return Clients.All.SendAsync("UserList", users);
        }

        // -------- disconnect handling --------
        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            // Which user was this connection?
            if (_connections.TryRemove(Context.ConnectionId, out var username))
            {
                if (_users.TryGetValue(username, out var bag))
                {
                    // Remove this connection ID from the bag
                    var remaining = new ConcurrentBag<string>(bag.Where(id => id != Context.ConnectionId));

                    if (remaining.IsEmpty)
                    {
                        // No more open connections -> user is really offline
                        _users.TryRemove(username, out _);
                        await Clients.All.SendAsync("UserLeft", username);
                    }
                    else
                    {
                        _users[username] = remaining;
                    }
                }

                // 🔥 Always send updated list after any disconnect
                await BroadcastUserList();
            }

            await base.OnDisconnectedAsync(exception);
        }

        // -------- register user name --------
        public async Task Register(string username)
        {
            if (string.IsNullOrWhiteSpace(username)) return;

            _connections[Context.ConnectionId] = username;

            var bag = _users.GetOrAdd(username, _ => new ConcurrentBag<string>());
            bag.Add(Context.ConnectionId);

            // confirm to caller
            await Clients.Caller.SendAsync("Registered", username);

            // notify others someone joined
            await Clients.Others.SendAsync("UserJoined", username);

            // send full list to everyone
            var users = _users.Keys.OrderBy(u => u).ToList();
            await Clients.All.SendAsync("UserList", users);
        }


        // -------- public message --------
        public async Task SendPublicMessage(string user, string message)
        {
            if (string.IsNullOrWhiteSpace(message)) return;
            var now = DateTime.UtcNow;

            var msg = new Message
            {
                FromUser = user,
                ToUser = null,
                Body = message,
                Timestamp = now,
                IsPrivate = false
            };
            _db.Messages.Add(msg);
            await _db.SaveChangesAsync();

            await Clients.All.SendAsync("ReceivePublicMessage", user, message, now.ToString("o"));
        }

        // -------- private message --------
        public async Task SendPrivateMessage(string fromUser, string toUser, string message)
        {
            if (string.IsNullOrWhiteSpace(toUser) || string.IsNullOrWhiteSpace(message)) return;
            var now = DateTime.UtcNow;

            var msg = new Message
            {
                FromUser = fromUser,
                ToUser = toUser,
                Body = message,
                Timestamp = now,
                IsPrivate = true
            };
            _db.Messages.Add(msg);
            await _db.SaveChangesAsync();

            // back to sender
            await Clients.Caller.SendAsync("ReceivePrivateMessage", fromUser, toUser, message, now.ToString("o"));

            // to receiver
            if (_users.TryGetValue(toUser, out var connections))
            {
                foreach (var connId in connections)
                {
                    await Clients.Client(connId)
                                 .SendAsync("ReceivePrivateMessage", fromUser, toUser, message, now.ToString("o"));
                }
            }
        }

        // -------- typing indicator --------
        public async Task Typing(string? toUser)
        {
            _connections.TryGetValue(Context.ConnectionId, out var fromUser);
            if (string.IsNullOrWhiteSpace(fromUser))
                return;

            if (string.IsNullOrWhiteSpace(toUser))
            {
                // public chat typing
                await Clients.Others.SendAsync("UserTyping", fromUser, null);
            }
            else
            {
                // private chat typing
                if (_users.TryGetValue(toUser, out var connections))
                {
                    foreach (var connId in connections)
                    {
                        await Clients.Client(connId)
                                     .SendAsync("UserTyping", fromUser, toUser);
                    }
                }
            }
        }

        // -------- history --------
        public async Task<List<MessageDto>> GetConversationHistory(string? withUser)
        {
            _connections.TryGetValue(Context.ConnectionId, out var caller);

            if (string.IsNullOrWhiteSpace(withUser))
            {
                var publicMsgs = await _db.Messages
                    .Where(m => !m.IsPrivate)
                    .OrderByDescending(m => m.Timestamp)
                    .Take(50)
                    .OrderBy(m => m.Timestamp)
                    .Select(m => new MessageDto
                    {
                        FromUser = m.FromUser,
                        ToUser = m.ToUser,
                        Body = m.Body,
                        Timestamp = m.Timestamp
                    })
                    .ToListAsync();

                return publicMsgs;
            }
            else
            {
                var msgs = await _db.Messages
                    .Where(m =>
                        m.IsPrivate &&
                        ((m.FromUser == caller && m.ToUser == withUser) ||
                         (m.FromUser == withUser && m.ToUser == caller)))
                    .OrderByDescending(m => m.Timestamp)
                    .Take(50)
                    .OrderBy(m => m.Timestamp)
                    .Select(m => new MessageDto
                    {
                        FromUser = m.FromUser,
                        ToUser = m.ToUser,
                        Body = m.Body,
                        Timestamp = m.Timestamp
                    })
                    .ToListAsync();

                return msgs;
            }
        }
        public async Task MarkConversationSeen(string otherUser)
        {
            // who is calling?
            _connections.TryGetValue(Context.ConnectionId, out var caller);
            if (string.IsNullOrWhiteSpace(caller) || string.IsNullOrWhiteSpace(otherUser))
                return;

            // notify the other user that caller has seen their messages
            if (_users.TryGetValue(otherUser, out var connections))
            {
                foreach (var connId in connections)
                {
                    await Clients.Client(connId).SendAsync("ConversationSeen", caller);
                }
            }
        }

    }
}
