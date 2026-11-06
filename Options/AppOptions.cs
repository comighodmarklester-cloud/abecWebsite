namespace ABEC_System.Options;

public class EmailSettings
{
    public const string SectionName = "Email";

    public bool Enabled { get; set; }
    public string Host { get; set; } = "smtp.gmail.com";
    public int Port { get; set; } = 587;
    public bool UseSsl { get; set; } = true;
    public string Username { get; set; } = "abec.legazpi10@gmail.com";
    public string Password { get; set; } = string.Empty;
    public string FromAddress { get; set; } = "abec.legazpi10@gmail.com";
    public string FromName { get; set; } = "ABEC System";

    /// <summary>
    /// Optional folder (relative to content root or absolute) where email HTML copies are saved.
    /// Used for local troubleshooting only — not a substitute for SMTP delivery.
    /// </summary>
    public string PickupDirectory { get; set; } = "App_Data/email-outbox";
}

public class AppSettings
{
    public const string SectionName = "App";

    public string PublicBaseUrl { get; set; } = "http://localhost:5188";
}
