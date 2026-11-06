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
            Username = string.IsNullOrWhiteSpace(current.Username) ? "abec.legazpi10@gmail.com" : current.Username,
            FromName = string.IsNullOrWhiteSpace(current.FromName) ? "ABEC System" : current.FromName,
            FromAddress = string.IsNullOrWhiteSpace(current.FromAddress) ? "abec.legazpi10@gmail.com" : current.FromAddress,
            PasswordConfigured = configured,
            PasswordHint = configured ? "••••••••••••••••" : "",
            PublicBaseUrl = publicBaseUrl,
            PublicBaseUrlIsReachableRemotely = IsRemoteReachableUrl(publicBaseUrl)
        };
    }

    public async Task<ApiResponse<SmtpSettingsDto>> SaveSettingsAsync(UpdateSmtpSettingsDto dto, CancellationToken cancellationToken = default)
    {
        var username = (dto.Username ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(username))
            username = "abec.legazpi10@gmail.com";
        if (!username.Contains('@'))
            return ApiResponse<SmtpSettingsDto>.Fail("A valid Gmail address is required for SMTP Username.");

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
                "Enter a Google App Password (16 characters) for abec.legazpi10@gmail.com. Create one at https://myaccount.google.com/apppasswords");
        }

        var publicBaseUrl = string.IsNullOrWhiteSpace(dto.PublicBaseUrl)
            ? (_appOptions.CurrentValue.PublicBaseUrl ?? string.Empty).Trim().TrimEnd('/')
            : dto.PublicBaseUrl.Trim().TrimEnd('/');

        Uri? publicUri = null;
        if (!string.IsNullOrWhiteSpace(publicBaseUrl) && !Uri.TryCreate(publicBaseUrl, UriKind.Absolute, out publicUri))
            return ApiResponse<SmtpSettingsDto>.Fail("Public Base URL must be a full URL, e.g. https://your-domain.com or https://xxxx.trycloudflare.com");

        if (!string.IsNullOrWhiteSpace(publicBaseUrl)
            && publicUri is not null
            && publicUri.Scheme is not ("http" or "https"))
            return ApiResponse<SmtpSettingsDto>.Fail("Public Base URL must start with http:// or https://");

        var pickup = string.IsNullOrWhiteSpace(current.PickupDirectory)
            ? "App_Data/email-outbox"
            : current.PickupDirectory;

        var payload = new
        {
            App = new
            {
                PublicBaseUrl = string.IsNullOrWhiteSpace(publicBaseUrl) ? "http://localhost:5188" : publicBaseUrl
            },
            Email = new
            {
                Enabled = dto.Enabled,
                Host = string.IsNullOrWhiteSpace(dto.Host) ? "smtp.gmail.com" : dto.Host.Trim(),
                Port = dto.Port <= 0 ? 587 : dto.Port,
                UseSsl = true,
                Username = username,
                Password = password,
                FromAddress = username,
                FromName = string.IsNullOrWhiteSpace(dto.FromName) ? "ABEC System" : dto.FromName.Trim(),
                PickupDirectory = pickup
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
            _logger.LogWarning(ex, "Could not mirror smtp.local.json to bin output.");
        }

        await Task.Delay(250, cancellationToken);

        var remote = IsRemoteReachableUrl(publicBaseUrl);
        _logger.LogInformation(
            "SMTP + PublicBaseUrl saved. User={User} PublicBaseUrl={Url} RemoteReachable={Remote}",
            username, publicBaseUrl, remote);

        var message = remote
            ? "Settings saved. Confirm Slot links will work for applicants on any network."
            : "Settings saved. Public Base URL is still localhost/LAN — applicants on other networks will not be able to open Confirm Slot. Use a public HTTPS URL (hosted domain or Cloudflare Tunnel).";

        return ApiResponse<SmtpSettingsDto>.Ok(GetSettings(), message);
    }

    private static bool IsRemoteReachableUrl(string? url)
    {
        if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url, UriKind.Absolute, out var uri))
            return false;

        var host = uri.Host;
        if (string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase)
            || host == "127.0.0.1"
            || host == "::1"
            || host == "0.0.0.0")
            return false;

        // Private LAN ranges are not reachable from other networks / mobile data.
        if (System.Net.IPAddress.TryParse(host, out var ip))
        {
            var bytes = ip.GetAddressBytes();
            if (ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork && bytes.Length == 4)
            {
                if (bytes[0] == 10) return false;
                if (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) return false;
                if (bytes[0] == 192 && bytes[1] == 168) return false;
            }
        }

        return true;
    }
}
