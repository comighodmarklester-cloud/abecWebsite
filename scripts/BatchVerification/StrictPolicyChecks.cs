using ABEC_System.Data;
using ABEC_System.Options;
using ABEC_System.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;

internal static class StrictPolicyChecks
{
    public static async Task<int> Run(IWebHostEnvironment environment, string root)
    {
        var checks = 0;
        void Check(bool condition, string label) { if (!condition) throw new Exception(label); checks++; }
        environment.EnvironmentName = "Production";
        async Task<HttpResponse> Request(string? origin = null, string? referer = null, string? site = null, bool cookie = false, string method = "POST", string path = "/api/training-rooms")
        {
            var context = new DefaultHttpContext();
            context.Request.Scheme = "https"; context.Request.Host = new("internal.example.invalid");
            context.Request.Path = path; context.Request.Method = method; context.Response.Body = new MemoryStream();
            if (origin is not null) context.Request.Headers.Origin = origin;
            if (referer is not null) context.Request.Headers.Referer = referer;
            if (site is not null) context.Request.Headers["Sec-Fetch-Site"] = site;
            if (cookie) context.Request.Headers.Cookie = "abec-student-session=opaque-test-cookie";
            var middleware = new RequestSecurityMiddleware(ctx => { ctx.Response.StatusCode = 204; return Task.CompletedTask; }, environment, new PolicyOptions());
            await middleware.InvokeAsync(context); return context.Response;
        }
        foreach (var origin in new[] { "https://attacker.example", "null", AppSettings.DefaultProductionBaseUrl + ".attacker.example", "http://localhost:5500", "https://user@" + new Uri(AppSettings.DefaultProductionBaseUrl).Host })
            Check((await Request(origin: origin, cookie: true)).StatusCode == 403, "Untrusted write origin was accepted.");
        Check((await Request(origin: AppSettings.DefaultProductionBaseUrl, cookie: true)).StatusCode == 204, "Configured public origin must work behind a proxy.");
        Check((await Request(referer: AppSettings.DefaultProductionBaseUrl + "/Views/Admin/Reports.html", cookie: true)).StatusCode == 204, "Trusted Referer must support legacy browsers.");
        Check((await Request(referer: "https://attacker.example/page", cookie: true)).StatusCode == 403, "Untrusted Referer must be rejected.");
        Check((await Request(cookie: true)).StatusCode == 403, "Ambient cookies without origin evidence must be rejected.");
        foreach (var site in new[] { "cross-site", "same-site" })
            Check((await Request(site: site, cookie: true)).StatusCode == 403, "Untrusted browser site metadata was accepted.");
        Check((await Request(site: "same-origin", cookie: true)).StatusCode == 204, "Same-origin browser requests must work.");
        Check((await Request()).StatusCode == 204, "Stateless non-browser clients must remain supported.");
        Check((await Request(origin: "https://attacker.example", method: "GET", path: "/confirm-slot")).StatusCode == 204, "Opening email links must remain readable.");
        Check((await Request(origin: "https://attacker.example", path: "/confirm-slot/")).StatusCode == 403, "A trailing slash must not bypass slot write-origin protection.");
        Check((await Request(origin: "null", site: "same-origin", path: "/confirm-slot")).StatusCode == 403, "Slot posts with null Origin require a valid anti-forgery cookie/form pair.");
        Check((await Request(origin: "null", site: "same-origin", cookie: true)).StatusCode == 403, "Null Origin must never bypass API write protection.");
        var response = await Request(method: "GET");
        Check(response.Headers["X-Content-Type-Options"] == "nosniff" && response.Headers.CacheControl == "no-store", "Sensitive responses must disable MIME sniffing and caching.");
        Check(response.Headers.ContainsKey("Strict-Transport-Security") && response.Headers["Content-Security-Policy"].ToString().Contains("frame-ancestors 'self'"), "Production response protections are missing.");
        environment.EnvironmentName = "Development";
        Check((await Request(origin: "http://localhost:5500", cookie: true)).StatusCode == 204, "Explicit development origins must remain usable.");
        var uploadRoot = Path.Combine(root, "uploads"); Directory.CreateDirectory(uploadRoot);
        await File.WriteAllTextAsync(Path.Combine(uploadRoot, "valid.pdf"), "%PDF-1.4\n<svg onload=alert(1)>");
        var verified = await UploadedDocument.OpenAsync(uploadRoot, "valid.pdf", default);
        Check(verified.ContentType == "application/pdf" && verified.Stream?.ReadByte() == '%', "Document MIME and stream position must be verified.");
        if (verified.Stream is not null) await verified.Stream.DisposeAsync();
        await File.WriteAllTextAsync(Path.Combine(uploadRoot, "invalid.pdf"), "<html><script>danger()</script></html>");
        await File.WriteAllTextAsync(Path.Combine(root, "outside.pdf"), "%PDF-1.4\n");
        await File.WriteAllTextAsync(Path.Combine(uploadRoot, "image.svg"), "<svg onload=alert(1)>");
        foreach (var path in new[] { "../outside.pdf", Path.Combine(root, "outside.pdf"), Path.Combine(uploadRoot, "valid.pdf"), "invalid.pdf", "image.svg" })
            Check((await UploadedDocument.OpenAsync(uploadRoot, path, default)).Stream is null, "Unsafe upload path or type was opened.");
        await File.WriteAllBytesAsync(Path.Combine(uploadRoot, "valid.png"), [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        var png = await UploadedDocument.OpenAsync(uploadRoot, "valid.png", default);
        Check(png.ContentType == "image/png", "Valid image previews must work."); if (png.Stream is not null) await png.Stream.DisposeAsync();
        using (var truncatedPdf = new MemoryStream("%PDFgarbage"u8.ToArray()))
            Check(!await UploadedDocument.HasSignatureAsync(truncatedPdf, "application/pdf", default), "A partial PDF signature must not pass validation.");
        using (var invalidPng = new MemoryStream(new byte[] { 0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0 }))
            Check(!await UploadedDocument.HasSignatureAsync(invalidPng, "image/png", default), "The complete PNG signature must be validated.");
        foreach (var payload in new[] { "admins`; DROP TABLE admins;--", "../admins", "admins name", "admins\nFORGED" })
        {
            var rejected = false; try { SchemaUpgradeSql.Validate(payload, "email", "VARCHAR(150) NULL"); } catch (ArgumentException) { rejected = true; }
            Check(rejected, "Schema identifiers must reject injection.");
        }
        var rejectedType = false; try { SchemaUpgradeSql.Validate("admins", "email", "VARCHAR(150) NULL; DROP TABLE admins"); } catch (ArgumentException) { rejectedType = true; }
        Check(rejectedType, "Schema definitions must reject arbitrary SQL.");
        SchemaUpgradeSql.Validate("admins", "email", "VARCHAR(150) NULL"); checks++;
        foreach (var operation in new Action[] {
            () => SchemaUpgradeSql.AddColumn("admins", "password", "VARCHAR(150) NULL"),
            () => SchemaUpgradeSql.AddColumn("admins", "email", "TEXT NULL"),
            () => SchemaUpgradeSql.DropColumn("admins", "password") })
        {
            var rejected = false; try { operation(); } catch (ArgumentException) { rejected = true; }
            Check(rejected, "Valid-looking but unapproved schema operations must be rejected.");
        }
        Check(SchemaUpgradeSql.AddColumn("admins", "email", "VARCHAR(150) NULL") == "ALTER TABLE `admins` ADD COLUMN `email` VARCHAR(150) NULL", "Approved schema SQL must be an exact catalog statement.");
        Check(!AuthService.PasswordMatches(new string('x', 73), BCrypt.Net.BCrypt.HashPassword(new string('x', 72))), "Overlong BCrypt passwords must not match by truncation.");
        Check(!AuthService.PasswordMatches("invalid", "$2a$broken"), "Malformed stored password hashes must fail closed.");
        foreach (var origin in new[] { "https://localhost.", "https://test.localhost.", "https://test.local." })
            Check(!PublicAppUrl.IsPublicHttps(origin), "Trailing-dot private hostnames must not be accepted as public origins.");
        return checks;
    }
    private sealed class PolicyOptions : IOptionsMonitor<AppSettings>
    {
        public AppSettings CurrentValue { get; } = new();
        public AppSettings Get(string? name) => CurrentValue;
        public IDisposable? OnChange(Action<AppSettings, string?> listener) => null;
    }
}
