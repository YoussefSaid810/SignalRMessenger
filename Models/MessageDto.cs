namespace SignalRMessenger.Models;

public class MessageDto
{
    public string FromUser { get; set; } = string.Empty;
    public string? ToUser { get; set; }
    public string Body { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
}
