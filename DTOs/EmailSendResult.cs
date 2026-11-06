namespace ABEC_System.DTOs;

public class EmailSendResult
{
    public bool Sent { get; set; }
    public bool Skipped { get; set; }
    public string Channel { get; set; } = "none";
    public string Message { get; set; } = string.Empty;
    public string? OutboxPath { get; set; }

    public static EmailSendResult Ok(string channel, string message, string? outboxPath = null)
        => new() { Sent = true, Channel = channel, Message = message, OutboxPath = outboxPath };

    public static EmailSendResult Skip(string message)
        => new() { Skipped = true, Channel = "none", Message = message };

    public static EmailSendResult Fail(string message)
        => new() { Sent = false, Skipped = false, Channel = "none", Message = message };
}
