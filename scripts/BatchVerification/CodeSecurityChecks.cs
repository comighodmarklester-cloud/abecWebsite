using System.Net;
using ABEC_System.DTOs;
using ABEC_System.Options;
using ABEC_System.Services;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

internal static class CodeSecurityChecks
{
    public static async Task Run()
    {
        var checks = 0;
        void Check(bool condition, string label) { if (!condition) throw new Exception(label); checks++; }
        var root = Path.Combine(Path.GetTempPath(), "abec-security-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            var environment = new TestEnvironment { ContentRootPath = root, WebRootPath = Path.Combine(root, "wwwroot") };
            var recipient = Guid.NewGuid().ToString("N") + "@example.invalid";
            var subject = "Private subject " + Guid.NewGuid().ToString("N") + "\r\nFORGED";
            var options = new Monitor<EmailSettings>(new() { PickupDirectory = Path.Combine(root, "copies") });
            var logger = new CapturedLog<EmailService>();
            var service = new EmailService(options, environment, logger);
            Check(!(await service.SendAsync(recipient, subject, "<p>Private offer</p>")).Sent, "Disabled mail must report failure.");
            Check(!Directory.Exists(options.CurrentValue.PickupDirectory), "Mail copies require explicit opt-in.");
            Check(logger.Entries.All(e => !e.Contains(recipient) && !e.Contains(subject) && !e.Contains("FORGED") && !e.Contains('\n')), "Disabled mail logs must not expose recipient/subject or injected lines.");

            options.CurrentValue.SaveDevelopmentCopies = true;
            environment.EnvironmentName = "Production";
            await service.SendAsync(recipient, subject, "<p>Private offer</p>");
            Check(!Directory.Exists(options.CurrentValue.PickupDirectory), "Production must never write local email copies, even when opted in.");
            environment.EnvironmentName = "Development";
            await service.SendAsync(recipient, subject, "<p>Private offer</p>");
            var copy = Directory.GetFiles(options.CurrentValue.PickupDirectory).Single();
            Check(!Path.GetFileName(copy).Contains(recipient) && File.ReadAllText(copy).Contains("Private offer"), "Explicit development copies work without addresses in filenames.");
            options.CurrentValue.PickupDirectory = Path.Combine(environment.WebRootPath, "mail");
            await service.SendAsync(recipient, subject, "<p>Private offer</p>");
            Check(!Directory.Exists(options.CurrentValue.PickupDirectory), "Copies inside the public web root must be rejected.");

            options.CurrentValue.SaveDevelopmentCopies = false;
            options.CurrentValue.Enabled = true;
            options.CurrentValue.Host = "127.0.0.1";
            options.CurrentValue.Port = 1;
            options.CurrentValue.Username = Guid.NewGuid().ToString("N") + "@example.invalid";
            options.CurrentValue.FromAddress = options.CurrentValue.Username;
            options.CurrentValue.Password = Guid.NewGuid().ToString("N");
            var invalidRecipient = recipient + "\r\nFORGED";
            var failed = await service.SendAsync(invalidRecipient, subject, "<p>Private offer</p>");
            Check(!failed.Sent && failed.Message.Contains("Reference:"), "Provider/parsing errors return an actionable reference without raw provider details.");
            Check(!failed.Message.Contains(recipient) && !failed.Message.Contains("FORGED") && !failed.Message.Contains(options.CurrentValue.Password), "Error responses must not expose addresses, injected text or credentials.");
            Check(logger.Entries.All(e => !e.Contains(recipient) && !e.Contains("FORGED") && !e.Contains(options.CurrentValue.Username) && !e.Contains(options.CurrentValue.Password)), "All email log branches must avoid sensitive values and provider exception text.");

            using var cache = new MemoryCache(new MemoryCacheOptions());
            var handler = new LocationHandler();
            using var http = new HttpClient(handler);
            var locationLog = new CapturedLog<LocationService>();
            var locations = new LocationService(http, cache, environment, locationLog);
            foreach (var code in new[] { "../../secret", "050000000\r\nFORGED", "05000000x", "123", "１２３４５６７８９", "12345678901" })
            {
                Check(!(await locations.GetCitiesAsync(code)).Success, "Invalid province code was accepted.");
                Check(!(await locations.GetBarangaysAsync(code)).Success, "Invalid city code was accepted.");
            }
            Check(handler.Requests.Count == 0, "Invalid location codes must not cause filesystem/network lookups.");
            foreach (var code in new[] { "050050000", "0500501000" })
            {
                Check((await locations.GetCitiesAsync(code)).Success, "Valid nine/ten-digit province codes must work.");
                Check((await locations.GetBarangaysAsync(code)).Success, "Valid nine/ten-digit city codes must work.");
            }
            handler.Fail = true;
            await locations.GetCitiesAsync("050060000");
            Check(locationLog.Entries.Count > 0 && locationLog.Entries.All(e => !e.Contains("FORGED") && !e.Contains("050060000") && !e.Contains('\n')), "Location errors must omit request values and raw provider exceptions.");

            var configLog = new CapturedLog<EmailConfigService>();
            var config = new EmailConfigService(environment, options, new Monitor<AppSettings>(new()), configLog);
            Check(!(await config.SaveSettingsAsync(new() { Username = invalidRecipient })).Success, "SMTP usernames must reject control characters.");
            Check(!(await config.SaveSettingsAsync(new() { Username = options.CurrentValue.Username, Host = "smtp.example.invalid\r\nFORGED" })).Success, "SMTP host must reject control characters.");
            Check(!(await config.SaveSettingsAsync(new() { Username = options.CurrentValue.Username, FromName = "ABEC\nFORGED" })).Success, "Sender name must reject control characters.");
            Check(!(await config.SaveSettingsAsync(new() { Username = options.CurrentValue.Username, Port = 70000 })).Success, "SMTP port must be bounded.");
            Check(!File.Exists(Path.Combine(root, "smtp.local.json")), "Rejected settings must not be saved.");
            var saved = await config.SaveSettingsAsync(new() { Username = options.CurrentValue.Username, Enabled = true });
            Check(saved.Success && File.Exists(Path.Combine(root, "smtp.local.json")), "Valid local settings must still save.");
            Check(configLog.Entries.All(e => !e.Contains(options.CurrentValue.Username) && !e.Contains(options.CurrentValue.Password)), "Settings logs must omit credentials and usernames.");
            checks += await SmtpDiagnosticChecks.Run();
            checks += await StrictPolicyChecks.Run(environment, root);
            Console.WriteLine($"PASS {checks} privacy, input, cross-origin, response, upload and schema security checks. No external requests or email sent.");
        }
        finally
        {
            var expected = Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            if (Path.GetFullPath(root).StartsWith(expected, StringComparison.OrdinalIgnoreCase)) Directory.Delete(root, true);
        }
    }

    private sealed class Monitor<T>(T value) : IOptionsMonitor<T>
    {
        public T CurrentValue => value;
        public T Get(string? name) => value;
        public IDisposable? OnChange(Action<T, string?> listener) => null;
    }
    private sealed class CapturedLog<T> : ILogger<T>
    {
        public List<string> Entries { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel level, EventId id, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            => Entries.Add(formatter(state, exception) + (exception?.ToString() ?? ""));
    }
    private sealed class LocationHandler : HttpMessageHandler
    {
        public List<Uri> Requests { get; } = [];
        public bool Fail { get; set; }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(request.RequestUri!);
            if (Fail) throw new HttpRequestException("FORGED\r\n" + request.RequestUri);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("[{\"code\":\"050050100\",\"name\":\"Synthetic location\"}]", System.Text.Encoding.UTF8, "application/json") });
        }
    }
}
