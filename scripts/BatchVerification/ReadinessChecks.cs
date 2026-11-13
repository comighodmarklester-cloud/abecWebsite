using System.Diagnostics;
using System.Net;
using System.Text.Json;
using ABEC_System.Services;

internal static class ReadinessChecks
{
    public static async Task<int> Run(string temporaryRoot)
    {
        var checks = 0;
        void Check(bool ok, string label) { if (!ok) throw new Exception(label); checks++; }
        var readiness = new ApplicationReadiness();
        Check(!readiness.Snapshot(false).Ok && !readiness.Snapshot(true).Ok, "A reachable database must not hide failed schema initialization.");
        readiness.MarkSchemaReady();
        Check(readiness.Snapshot(true).Ok && !readiness.Snapshot(false).Ok, "Readiness requires database availability after schema initialization too.");
        var root = Path.Combine(temporaryRoot, "readiness");
        Directory.CreateDirectory(Path.Combine(root, "Views"));
        using var https = new VerificationHttps(root);
        var listener = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
        listener.Start(); var port = ((IPEndPoint)listener.LocalEndpoint).Port; listener.Stop();
        var origin = new Uri("https://127.0.0.1:" + port);
        var start = new ProcessStartInfo("dotnet") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var arg in new[] { Path.Combine(AppContext.BaseDirectory, "ABEC System.dll"), "--urls", origin.ToString().TrimEnd('/'), "--contentRoot", root, "--webroot", Path.Combine(Directory.GetCurrentDirectory(), "wwwroot") }) start.ArgumentList.Add(arg);
        start.Environment["ConnectionStrings__DefaultConnection"] = "Server=127.0.0.1;Port=1;Database=unavailable_readiness_fixture;User ID=unavailable;Password=" + Guid.NewGuid().ToString("N") + ";Connection Timeout=1;Pooling=false;";
        start.Environment["ASPNETCORE_ENVIRONMENT"] = "Production";
        start.Environment["Email__Enabled"] = "false";
        https.Configure(start);
        using var process = Process.Start(start)!;
        var stdout = process.StandardOutput.ReadToEndAsync(); var stderr = process.StandardError.ReadToEndAsync();
        try
        {
            using var client = https.Client(origin);
            var running = false;
            for (var n = 0; n < 100 && !process.HasExited; n++)
            {
                try { using var live = await client.GetAsync("/api/health/live"); if (live.StatusCode == HttpStatusCode.OK) { running = true; break; } }
                catch (HttpRequestException) { }
                await Task.Delay(150);
            }
            Check(running, "Process liveness stays available when its test database is unreachable.");
            using var response = await client.GetAsync("/api/health");
            Check(response.StatusCode == HttpStatusCode.ServiceUnavailable, "HTTP readiness returns503 for an unreachable database/schema.");
            var text = await response.Content.ReadAsStringAsync(); using var body = JsonDocument.Parse(text);
            Check(!body.RootElement.GetProperty("ok").GetBoolean() && !body.RootElement.GetProperty("database").GetBoolean() && !body.RootElement.GetProperty("schemaReady").GetBoolean(), "Unhealthy JSON identifies both unavailable database and uninitialized schema.");
            Check(!text.Contains("127.0.0.1") && !text.Contains("Password", StringComparison.OrdinalIgnoreCase), "Public readiness omits connection details.");
            Check(response.Headers.CacheControl?.NoStore == true, "Readiness responses cannot be cached as healthy.");
        }
        finally
        {
            if (!process.HasExited) { process.Kill(true); await process.WaitForExitAsync(); }
            await stdout; await stderr;
        }
        return checks;
    }
}
