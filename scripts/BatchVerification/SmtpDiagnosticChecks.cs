using System.Net;
using System.Net.Sockets;
using System.Text;
using ABEC_System.Options;
using ABEC_System.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

internal static class SmtpDiagnosticChecks
{
    public static async Task<int> Run()
    {
        var checks = 0;
        foreach (var failureStage in new[] { "connect", "authenticate", "send" })
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            using var listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            var providerMarker = "private-provider-" + Guid.NewGuid().ToString("N");
            var server = ServeAsync(listener, failureStage, providerMarker, timeout.Token);
            var recipient = Guid.NewGuid().ToString("N") + "@example.invalid";
            var subject = "private-subject-" + Guid.NewGuid().ToString("N");
            var password = VerificationAccounts.Password;
            var settings = new EmailSettings
            {
                Enabled = true,
                Host = IPAddress.Loopback.ToString(),
                Port = ((IPEndPoint)listener.LocalEndpoint).Port,
                UseSsl = false,
                Username = VerificationAccounts.AdminUsername + "@example.invalid",
                Password = password,
                FromAddress = VerificationAccounts.AdminUsername + "@example.invalid"
            };
            var logger = new DiagnosticLog();
            try
            {
                // Development-only loopback fixture, never a real SMTP account/recipient.
                var environment = new TestEnvironment { EnvironmentName = "Development" };
                var service = new EmailService(new Settings(settings), environment, logger);
                var result = await service.SendAsync(recipient, subject, "<p>Synthetic QA fixture</p>");
                await server;
                Check(!result.Sent, "A protocol failure must not be reported as sent.");
                Check(result.Message.Contains("during " + failureStage) && result.Message.Contains("Reference:"),
                    "The sanitized result must identify the failed SMTP operation.");
                Check(logger.Entries.Any(e => e.Contains("failed during " + failureStage) && e.Contains("SmtpProtocolException")),
                    "The server log must identify the failed SMTP operation and exception type.");
                var exposed = logger.Entries.Append(result.Message);
                Check(exposed.All(e => !e.Contains(recipient) && !e.Contains(subject) && !e.Contains(settings.Username)
                    && !e.Contains(password) && !e.Contains(providerMarker)),
                    "Stage diagnostics must not expose addresses, subjects, credentials or provider response text.");
                Check(logger.Exceptions.All(e => e is null), "SMTP diagnostics must not log raw exception objects.");
                Check(!logger.Entries.Any(e => e.Contains("SMTP message accepted")),
                    "A failure before message acceptance must not emit an acceptance event.");
            }
            finally
            {
                timeout.Cancel();
                listener.Stop();
                try { await server; } catch (OperationCanceledException) { } catch (SocketException) { }
            }

            void Check(bool condition, string message)
            {
                if (!condition) throw new Exception(failureStage + ": " + message);
                checks++;
            }
        }
        return checks;
    }

    private static async Task ServeAsync(TcpListener listener, string failureStage, string marker, CancellationToken ct)
    {
        using var client = await listener.AcceptTcpClientAsync(ct);
        await using var stream = client.GetStream();
        using var reader = new StreamReader(stream, Encoding.ASCII, leaveOpen: true);
        await using var writer = new StreamWriter(stream, Encoding.ASCII, leaveOpen: true) { NewLine = "\r\n", AutoFlush = true };
        if (failureStage == "connect")
        {
            await writer.WriteLineAsync("invalid SMTP greeting " + marker);
            return;
        }
        await writer.WriteLineAsync("220 localhost synthetic QA SMTP");
        while (await reader.ReadLineAsync(ct) is { } line)
        {
            if (line.StartsWith("EHLO ", StringComparison.OrdinalIgnoreCase))
                await writer.WriteAsync("250-localhost\r\n250 AUTH PLAIN\r\n");
            else if (line.StartsWith("AUTH ", StringComparison.OrdinalIgnoreCase))
            {
                if (failureStage == "authenticate") return;
                await writer.WriteLineAsync("235 2.7.0 Synthetic authentication accepted");
            }
            else if (line.StartsWith("MAIL FROM:", StringComparison.OrdinalIgnoreCase)) return;
            else if (line.Equals("QUIT", StringComparison.OrdinalIgnoreCase))
            {
                await writer.WriteLineAsync("221 Goodbye");
                return;
            }
            else await writer.WriteLineAsync("250 OK");
        }
    }

    private sealed class Settings(EmailSettings value) : IOptionsMonitor<EmailSettings>
    {
        public EmailSettings CurrentValue => value;
        public EmailSettings Get(string? name) => value;
        public IDisposable? OnChange(Action<EmailSettings, string?> listener) => null;
    }

    private sealed class DiagnosticLog : ILogger<EmailService>
    {
        public List<string> Entries { get; } = [];
        public List<Exception?> Exceptions { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel level, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            Entries.Add(formatter(state, exception));
            Exceptions.Add(exception);
        }
    }
}
