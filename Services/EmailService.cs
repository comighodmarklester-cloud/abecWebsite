using System.Text;
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
        var deliveryId = Guid.NewGuid().ToString("N");

        if (string.IsNullOrWhiteSpace(toEmail))
            return EmailSendResult.Fail("Recipient email address is missing.");

        // Local troubleshooting copy only — never treated as a successful send.
        try
        {
            if (_env.IsDevelopment() && settings.SaveDevelopmentCopies)
                await WritePickupAsync(settings, toEmail, subject, htmlBody, pdfAttachment, attachmentFileName, CancellationToken.None);
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Email {DeliveryId}: development copy failed ({ErrorType}).", deliveryId, ex.GetType().Name);
        }

        if (!settings.Enabled)
        {
            _logger.LogWarning("Email {DeliveryId}: sending is disabled.", deliveryId);
            return EmailSendResult.Fail("Email sending is disabled in configuration (Email:Enabled=false).");
        }

        var username = (settings.Username ?? string.Empty).Trim();
        var host = string.IsNullOrWhiteSpace(settings.Host) ? "smtp.gmail.com" : settings.Host.Trim();
        var password = host.Contains("gmail", StringComparison.OrdinalIgnoreCase)
            ? NormalizeSmtpPassword(settings.Password) : settings.Password ?? string.Empty;
        var fromAddress = string.IsNullOrWhiteSpace(settings.FromAddress)
            ? username
            : settings.FromAddress.Trim();
        var fromName = string.IsNullOrWhiteSpace(settings.FromName) ? "ABEC" : settings.FromName.Trim();
        var port = settings.Port <= 0 ? 587 : settings.Port;
        if (!_env.IsDevelopment() && !settings.UseSsl)
            return EmailSendResult.Fail("Production SMTP must use TLS. Configure Email__UseSsl=true in deployment secrets.");

        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
        {
            _logger.LogError(
                "Email {DeliveryId}: SMTP credentials are not configured.", deliveryId);
            return EmailSendResult.Fail(
                "Email was not sent: SMTP credentials are missing. Configure the mail provider through deployment secrets, or Email Delivery in local development.");
        }

        if (IsPlaceholderPassword(password))
        {
            _logger.LogError("Email {DeliveryId}: SMTP password is a placeholder.", deliveryId);
            return EmailSendResult.Fail(
                "Email was not sent: replace the placeholder SMTP password through deployment secrets.");
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
                "Email {DeliveryId}: connecting to SMTP (TLS={Tls}).", deliveryId, settings.UseSsl);

            await client.ConnectAsync(
                host,
                port,
                settings.UseSsl ? (port == 465 ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTls) : SecureSocketOptions.Auto,
                timeoutCts.Token);
            await client.AuthenticateAsync(username, password, timeoutCts.Token);
            await client.SendAsync(message, timeoutCts.Token);
            await client.DisconnectAsync(true, timeoutCts.Token);

            _logger.LogInformation("Email {DeliveryId}: SMTP delivery completed.", deliveryId);
            return EmailSendResult.Ok("smtp", $"Approval email sent to {toEmail}.");
        }
        catch (Exception ex)
        {
            // Provider exceptions can contain recipients, SMTP credentials and response text.
            // Log only a code-defined type and a random reference, never the exception itself.
            _logger.LogError("Email {DeliveryId}: SMTP delivery failed ({ErrorType}).", deliveryId, ex.GetType().Name);
            var reason = ex switch
            {
                MailKit.Security.AuthenticationException => "SMTP authentication failed. Verify the configured SMTP username and app password.",
                OperationCanceledException => "SMTP delivery timed out. Check the mail provider connection.",
                System.Net.Sockets.SocketException => "Could not connect to the SMTP server. Check the host, port and network connection.",
                _ => "SMTP delivery failed. Check the mail provider configuration and try again."
            };
            return EmailSendResult.Fail($"{reason} Reference: {deliveryId}.");
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
        root = Path.GetFullPath(root);
        var webRoot = Path.GetFullPath(_env.WebRootPath ?? Path.Combine(_env.ContentRootPath, "wwwroot"));
        if (string.Equals(root, webRoot, StringComparison.OrdinalIgnoreCase)
            || root.StartsWith(webRoot.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Development mail copies must be outside the web root.");

        Directory.CreateDirectory(root);

        var stamp = DateTime.Now.ToString("yyyyMMdd_HHmmss_fff");
        var baseName = $"{stamp}_{Guid.NewGuid():N}";
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
