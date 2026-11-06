using System.Text;
using System.Text.RegularExpressions;
using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using ABEC_System.Options;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;

namespace ABEC_System.Services;

public class EmailService : IEmailService
{
    private readonly IOptionsMonitor<EmailSettings> _settingsMonitor;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<EmailService> _logger;

    public EmailService(
        IOptionsMonitor<EmailSettings> settings,
        IWebHostEnvironment env,
        ILogger<EmailService> logger)
    {
        _settingsMonitor = settings;
        _env = env;
        _logger = logger;
    }

    public async Task<EmailSendResult> SendAsync(
        string toEmail,
        string subject,
        string htmlBody,
        byte[]? pdfAttachment = null,
        string? attachmentFileName = null,
        CancellationToken cancellationToken = default)
    {
        var settings = _settingsMonitor.CurrentValue;

        if (string.IsNullOrWhiteSpace(toEmail))
            return EmailSendResult.Fail("Recipient email address is missing.");

        // Local troubleshooting copy only — never treated as a successful send.
        try
        {
            await WritePickupAsync(settings, toEmail, subject, htmlBody, pdfAttachment, attachmentFileName, CancellationToken.None);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to write email pickup copy.");
        }

        if (!settings.Enabled)
        {
            _logger.LogWarning("Email disabled. To={To} Subject={Subject}", toEmail, subject);
            return EmailSendResult.Fail("Email sending is disabled in configuration (Email:Enabled=false).");
        }

        var username = (settings.Username ?? string.Empty).Trim();
        var password = NormalizeSmtpPassword(settings.Password);
        var fromAddress = string.IsNullOrWhiteSpace(settings.FromAddress)
            ? username
            : settings.FromAddress.Trim();
        var fromName = string.IsNullOrWhiteSpace(settings.FromName) ? "ABEC System" : settings.FromName.Trim();
        var host = string.IsNullOrWhiteSpace(settings.Host) ? "smtp.gmail.com" : settings.Host.Trim();
        var port = settings.Port <= 0 ? 587 : settings.Port;

        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
        {
            _logger.LogError(
                "SMTP App Password is not configured. Host={Host} User={User} To={To}",
                host, username, toEmail);
            return EmailSendResult.Fail(
                "Email was NOT sent: Gmail App Password is missing. Set Email:Password via user-secrets, environment variable Email__Password, or Admin → User Settings → Email Delivery.");
        }

        if (IsPlaceholderPassword(password))
        {
            _logger.LogError("SMTP App Password is still a placeholder value. User={User} To={To}", username, toEmail);
            return EmailSendResult.Fail(
                "Email was NOT sent: replace the placeholder App Password with a real Google App Password for abec.legazpi10@gmail.com.");
        }

        // Independent of HTTP request cancellation — Approve must finish SMTP even if the browser times out.
        using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(90));

        try
        {
            // Gmail requires the authenticated account to match the From address.
            if (host.Contains("gmail", StringComparison.OrdinalIgnoreCase))
                fromAddress = username;

            var message = new MimeMessage();
            message.From.Add(new MailboxAddress(fromName, fromAddress));
            message.To.Add(MailboxAddress.Parse(toEmail.Trim()));
            message.Subject = subject;
            message.ReplyTo.Add(new MailboxAddress(fromName, fromAddress));

            var builder = new BodyBuilder { HtmlBody = htmlBody };
            if (pdfAttachment is { Length: > 0 })
                builder.Attachments.Add(attachmentFileName ?? "document.pdf", pdfAttachment, new ContentType("application", "pdf"));

            message.Body = builder.ToMessageBody();

            using var client = new SmtpClient { Timeout = 90_000 };
            _logger.LogInformation(
                "Connecting to SMTP {Host}:{Port} (STARTTLS={StartTls}) as {User} → {To}",
                host, port, settings.UseSsl, username, toEmail);

            await client.ConnectAsync(
                host,
                port,
                settings.UseSsl ? SecureSocketOptions.StartTls : SecureSocketOptions.Auto,
                timeoutCts.Token);
            await client.AuthenticateAsync(username, password, timeoutCts.Token);
            await client.SendAsync(message, timeoutCts.Token);
            await client.DisconnectAsync(true, timeoutCts.Token);

            _logger.LogInformation("SMTP send completed successfully. To={To} Subject={Subject}", toEmail, subject);
            return EmailSendResult.Ok("smtp", $"Approval email sent to {toEmail}.");
        }
        catch (Exception ex)
        {
            var safe = SanitizeException(ex, password);
            _logger.LogError(ex, "SMTP send failed. Host={Host} User={User} To={To} Error={Error}", host, username, toEmail, safe);
            return EmailSendResult.Fail($"Failed to send email via SMTP: {safe}");
        }
    }

    private static string NormalizeSmtpPassword(string? password)
        => (password ?? string.Empty).Replace(" ", string.Empty).Trim();

    private static bool IsPlaceholderPassword(string password)
    {
        var p = password.Trim();
        return p.Contains("REPLACE", StringComparison.OrdinalIgnoreCase)
            || p.Contains("YOUR_", StringComparison.OrdinalIgnoreCase)
            || p.Contains("APP_PASSWORD", StringComparison.OrdinalIgnoreCase)
            || p.Contains("your-16", StringComparison.OrdinalIgnoreCase)
            || p.Equals("password", StringComparison.OrdinalIgnoreCase)
            || p.Equals("changeme", StringComparison.OrdinalIgnoreCase);
    }

    private static string SanitizeException(Exception ex, string password)
    {
        var detail = ex.GetBaseException().Message ?? ex.Message;
        if (!string.IsNullOrEmpty(password) && detail.Contains(password, StringComparison.Ordinal))
            detail = detail.Replace(password, "[REDACTED]", StringComparison.Ordinal);

        detail = Regex.Replace(detail, @"Password[=:].*", "Password=[REDACTED]", RegexOptions.IgnoreCase);

        if (detail.Contains("Authentication", StringComparison.OrdinalIgnoreCase)
            || detail.Contains("Invalid credentials", StringComparison.OrdinalIgnoreCase)
            || detail.Contains("5.7.8", StringComparison.OrdinalIgnoreCase)
            || detail.Contains("Username and Password not accepted", StringComparison.OrdinalIgnoreCase))
        {
            detail += " Authentication failed for abec.legazpi10@gmail.com — verify the Google App Password (not the normal Gmail password).";
        }
        else if (detail.Contains("connected", StringComparison.OrdinalIgnoreCase)
                 || detail.Contains("timeout", StringComparison.OrdinalIgnoreCase)
                 || detail.Contains("actively refused", StringComparison.OrdinalIgnoreCase))
        {
            detail += " Could not complete the connection to smtp.gmail.com:587.";
        }

        return detail;
    }

    private async Task WritePickupAsync(
        EmailSettings settings,
        string toEmail,
        string subject,
        string htmlBody,
        byte[]? pdfAttachment,
        string? attachmentFileName,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(settings.PickupDirectory))
            return;

        var root = Path.IsPathRooted(settings.PickupDirectory)
            ? settings.PickupDirectory
            : Path.Combine(_env.ContentRootPath, settings.PickupDirectory);

        Directory.CreateDirectory(root);

        var stamp = DateTime.Now.ToString("yyyyMMdd_HHmmss_fff");
        var safeTo = string.Concat(toEmail.Where(c => char.IsLetterOrDigit(c) || c is '@' or '.' or '-' or '_'));
        var baseName = $"{stamp}_{safeTo}";
        var htmlPath = Path.Combine(root, baseName + ".html");

        var wrapper = new StringBuilder();
        wrapper.AppendLine("<!DOCTYPE html><html><head><meta charset='utf-8'><title>")
            .Append(System.Net.WebUtility.HtmlEncode(subject))
            .AppendLine("</title></head><body>");
        wrapper.AppendLine($"<!-- To: {System.Net.WebUtility.HtmlEncode(toEmail)} -->");
        wrapper.AppendLine($"<!-- Subject: {System.Net.WebUtility.HtmlEncode(subject)} -->");
        wrapper.AppendLine(htmlBody);
        wrapper.AppendLine("</body></html>");

        await File.WriteAllTextAsync(htmlPath, wrapper.ToString(), Encoding.UTF8, cancellationToken);

        if (pdfAttachment is { Length: > 0 })
        {
            var pdfName = attachmentFileName ?? "attachment.pdf";
            var pdfPath = Path.Combine(root, baseName + "_" + Path.GetFileName(pdfName));
            await File.WriteAllBytesAsync(pdfPath, pdfAttachment, cancellationToken);
        }
    }
}
