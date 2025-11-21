using System.ComponentModel.DataAnnotations;

namespace SignalRMessenger.Models;

public class Message
{
    [Key]
    public int Id { get; set; }

    public string FromUser { get; set; } = string.Empty;

    // null for public messages
    public string? ToUser { get; set; }

    public string Body { get; set; } = string.Empty;

    public DateTime Timestamp { get; set; }

    public bool IsPrivate { get; set; }
}
