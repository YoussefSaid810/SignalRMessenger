using Microsoft.AspNetCore.SignalR;
using SignalRMessenger.Data;
using SignalRMessenger.Models;
using Microsoft.EntityFrameworkCore;
using System.Collections.Concurrent;

namespace SignalRMessenger.Hubs;

public class ChatHub : Hub
{
    private readonly ApplicationDbContext _db;

    // username -> connectionIds
    private static readonly ConcurrentDictionary<string, ConcurrentBag<string>> _users =
        new(StringComparer.OrdinalIgnoreCase);

    private static readonly ConcurrentDictionary<string, string> _connections =
        new();

    public ChatHub(ApplicationDbContext db)
    {
        _db = db;
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (_connections.TryRemove(Context.ConnectionId, out var username))
        {
            if (_users.TryGetValue(username, out var bag))
            {
                var remaining = new ConcurrentBag<string>(bag.Where(id => id != Context.ConnectionId));
                if (remaining.IsEmpty)
                {
                    _users.TryRemove(username, out _);
                    await Clients.All.SendAsync("UserLeft", username);
                }
                else
                {
                    _users[username] = remaining;
                }
            }
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task Register(string username)
    {
        if (string.IsNullOrWhiteSpace(username)) return;

        _connections[Context.ConnectionId] = username;
        var bag = _users.GetOrAdd(username, _ => new ConcurrentBag<string>());
        bag.Add(Context.ConnectionId);

        await Clients.Caller.SendAsync("Registered", username);

        var users = _users.Keys.OrderBy(u => u).ToList();
        await Clients.All.SendAsync("UserList", users);

        await Clients.Others.SendAsync("UserJoined", username);
    }

    public async Task SendPublicMessage(string user, string message)
    {
        if (string.IsNullOrWhiteSpace(message)) return;
        var now = DateTime.UtcNow;

        // save to DB as public (ToUser = null)
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

        // send back to caller
        await Clients.Caller.SendAsync("ReceivePrivateMessage", fromUser, toUser, message, now.ToString("o"));

        if (_users.TryGetValue(toUser, out var connections))
        {
            foreach (var connId in connections)
            {
                await Clients.Client(connId).SendAsync("ReceivePrivateMessage", fromUser, toUser, message, now.ToString("o"));
            }
        }
    }

    // Returns last 50 messages for a conversation.
    // If withUser is null or empty, returns last 50 public messages.
    public async Task<List<MessageDto>> GetConversationHistory(string? withUser)
    {
        // determine caller username
        _connections.TryGetValue(Context.ConnectionId, out var caller);

        if (string.IsNullOrWhiteSpace(withUser))
        {
            // public messages
            var publicMsgs = await _db.Messages
                .Where(m => !m.IsPrivate)
                .OrderByDescending(m => m.Timestamp)
                .Take(50)
                .OrderBy(m => m.Timestamp)
                .Select(m => new MessageDto {
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
            // private between caller and withUser
            var other = withUser;
            var msgs = await _db.Messages
                .Where(m => m.IsPrivate &&
                           ((m.FromUser == caller && m.ToUser == other) ||
                            (m.FromUser == other && m.ToUser == caller)))
                .OrderByDescending(m => m.Timestamp)
                .Take(50)
                .OrderBy(m => m.Timestamp)
                .Select(m => new MessageDto {
                    FromUser = m.FromUser,
                    ToUser = m.ToUser,
                    Body = m.Body,
                    Timestamp = m.Timestamp
                })
                .ToListAsync();

            return msgs;
        }
    }
}
