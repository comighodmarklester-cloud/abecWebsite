using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using ABEC_System.Options;
using Microsoft.Extensions.Options;
using System.Text.Json;

namespace ABEC_System.Services;

public class EmailConfigService : IEmailConfigService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true
    };

    private readonly IWebHostEnvironment _env;
    private readonly IOptionsMonitor<EmailSettings> _emailOptions;
    private readonly IOptionsMonitor<AppSettings> _appOptions;
    private readonly ILogger<EmailConfigService> _logger;

    public EmailConfigService(
        IWebHostEnvironment env,
        IOptionsMonitor<EmailSettings> emailOptions,
        IOptionsMonitor<AppSettings> appOptions,
        ILogger<EmailConfigService> logger)
    {
        _env = env;
        _emailOptions = emailOptions;
        _appOptions = appOptions;
        _logger = logger;
    }

    public SmtpSettingsDto GetSettings()
    {
        var current = _emailOptions.CurrentValue;
        var app = _appOptions.CurrentValue;
        var password = (current.Password ?? string.Empty).Trim();
        var configured = !string.IsNullOrWhiteSpace(password)
            && !password.Contains("REPLACE", StringComparison.OrdinalIgnoreCase)
            && !password.Contains("YOUR_", StringComparison.OrdinalIgnoreCase)
            && !password.Contains("APP_PASSWORD", StringComparison.OrdinalIgnoreCase);

        var publicBaseUrl = (app.PublicBaseUrl ?? string.Empty).Trim().TrimEnd('/');
        return new SmtpSettingsDto
        {
            Enabled = current.Enabled,
            Host = string.IsNullOrWhiteSpace(current.Host) ? "smtp.gmail.com" : current.Host,
            Port = current.Port <= 0 ? 587 : current.Port,
            Username = current.Username ?? string.Empty,
            FromName = string.IsNullOrWhiteSpace(current.FromName) ? "ABEC System" : current.FromName,
            FromAddress = string.IsNullOrWhiteSpace(current.FromAddress) ? current.Username ?? string.Empty : current.FromAddress,
            PasswordConfigured = configured,
            PublicBaseUrl = publicBaseUrl,
            PublicBaseUrlIsReachableRemotely = PublicAppUrl.IsPublicHttps(publicBaseUrl)
        };
    }

    public async Task<ApiResponse<SmtpSettingsDto>> SaveSettingsAsync(UpdateSmtpSettingsDto dto, CancellationToken cancellationToken = default)
    {
        if (!_env.IsDevelopment())
            return ApiResponse<SmtpSettingsDto>.Fail("Production email settings are managed through deployment secrets. Update the production mail provider, verified ABEC sender and public app URL in the hosting configuration.");
        var username = (dto.Username ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(username))
            username = (_emailOptions.CurrentValue.Username ?? string.Empty).Trim();
        if (username.Any(char.IsControl)
            || !System.Net.Mail.MailAddress.TryCreate(username, out var mailbox)
            || !string.Equals(mailbox.Address, username, StringComparison.OrdinalIgnoreCase))
            return ApiResponse<SmtpSettingsDto>.Fail("A valid email address is required for SMTP Username.");
        var host = string.IsNullOrWhiteSpace(dto.Host) ? "smtp.gmail.com" : dto.Host.Trim();
        if (Uri.CheckHostName(host) == UriHostNameType.Unknown || host.Any(char.IsControl))
            return ApiResponse<SmtpSettingsDto>.Fail("Enter a valid SMTP host name.");
        if (dto.Port < 0 || dto.Port > 65535)
            return ApiResponse<SmtpSettingsDto>.Fail("SMTP Port must be between 1 and 65535.");
        if ((dto.FromName ?? string.Empty).Any(char.IsControl) || dto.FromName?.Length > 150)
            return ApiResponse<SmtpSettingsDto>.Fail("Enter a sender name of up to 150 characters without control characters.");

        var current = _emailOptions.CurrentValue;
        var incomingPassword = (dto.Password ?? string.Empty).Replace(" ", string.Empty).Trim();
        var password = string.IsNullOrWhiteSpace(incomingPassword)
            ? (current.Password ?? string.Empty).Trim()
            : incomingPassword;

        if (string.IsNullOrWhiteSpace(password)
            || password.Contains("REPLACE", StringComparison.OrdinalIgnoreCase)
            || password.Contains("YOUR_", StringComparison.OrdinalIgnoreCase)
            || password.Contains("APP_PASSWORD", StringComparison.OrdinalIgnoreCase)
            || password.Contains("your-16", StringComparison.OrdinalIgnoreCase))
        {
            return ApiResponse<SmtpSettingsDto>.Fail(
                "Enter the mail provider's app password. For Gmail, create a Google App Password at https://myaccount.google.com/apppasswords");
        }

        var publicBaseUrl = string.IsNullOrWhiteSpace(dto.PublicBaseUrl)
            ? (_appOptions.CurrentValue.PublicBaseUrl ?? string.Empty).Trim().TrimEnd('/')
            : dto.PublicBaseUrl.Trim().TrimEnd('/');

        try { publicBaseUrl = PublicAppUrl.Normalize(publicBaseUrl, true); }
        catch (InvalidOperationException ex) { return ApiResponse<SmtpSettingsDto>.Fail(ex.Message); }

        var pickup = string.IsNullOrWhiteSpace(current.PickupDirectory)
            ? "App_Data/email-outbox"
            : current.PickupDirectory;

        var payload = new
        {
            App = new
            {
                PublicBaseUrl = publicBaseUrl
            },
            Email = new
            {
                Enabled = dto.Enabled,
                Host = host,
                Port = dto.Port <= 0 ? 587 : dto.Port,
                UseSsl = true,
                Username = username,
                Password = password,
                FromAddress = username,
                FromName = string.IsNullOrWhiteSpace(dto.FromName) ? "ABEC System" : dto.FromName.Trim(),
                PickupDirectory = pickup,
                SaveDevelopmentCopies = current.SaveDevelopmentCopies
            }
        };

        var path = Path.Combine(_env.ContentRootPath, "smtp.local.json");
        var json = JsonSerializer.Serialize(payload, JsonOptions);
        await File.WriteAllTextAsync(path, json, cancellationToken);

        try
        {
            var binPath = Path.Combine(_env.ContentRootPath, "bin", "Debug", "net8.0", "smtp.local.json");
            if (Directory.Exists(Path.GetDirectoryName(binPath)!))
                await File.WriteAllTextAsync(binPath, json, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Could not mirror local mail configuration ({ErrorType}).", ex.GetType().Name);
        }

        await Task.Delay(250, cancellationToken);

        var remote = PublicAppUrl.IsPublicHttps(publicBaseUrl);
        _logger.LogInformation("Mail configuration saved.");

        var message = remote
            ? "Settings saved. Applicant email links use the configured public HTTPS URL."
            : "Settings saved. Public Base URL is still localhost/LAN — applicants on other networks will not be able to open Confirm Slot. Use a public HTTPS URL (hosted domain or Cloudflare Tunnel).";

        return ApiResponse<SmtpSettingsDto>.Ok(GetSettings(), message);
    }

}
