using ABEC_System.Options;
using Microsoft.Extensions.Options;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;

namespace ABEC_System.Services;

public sealed class RequestSecurityMiddleware(RequestDelegate next, IWebHostEnvironment environment, IOptionsMonitor<AppSettings> settings)
{
    public static IReadOnlyList<string> DevelopmentOrigins { get; } = Array.AsReadOnly(new[]
    { "http://127.0.0.1:5500", "http://localhost:5500", "http://127.0.0.1:5188", "http://localhost:5188", "https://localhost:7162" });

    public async Task InvokeAsync(HttpContext context)
    {
        var request = context.Request;
        var canonicalPath = request.Path.Value?.TrimEnd('/');
        var slot = new[] { "/confirm-slot", "/reject-slot", "/decline-slot" }.Contains(canonicalPath, StringComparer.OrdinalIgnoreCase);
        var api = request.Path.StartsWithSegments("/api");
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        context.Response.Headers["X-Frame-Options"] = "SAMEORIGIN";
        context.Response.Headers["Content-Security-Policy"] = "base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'";
        context.Response.Headers["Referrer-Policy"] = slot ? "no-referrer" : "same-origin";
        if (!environment.IsDevelopment()) context.Response.Headers["Strict-Transport-Security"] = "max-age=15552000";
        if (api || slot) context.Response.Headers.CacheControl = "no-store";
        if (slot) context.Response.Headers["X-Robots-Tag"] = "noindex, nofollow";

        if ((api || slot) && !HttpMethods.IsGet(request.Method) && !HttpMethods.IsHead(request.Method) && !HttpMethods.IsOptions(request.Method)
            && !await TrustedWriteAsync(context, slot))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsJsonAsync(new { success = false, message = "This request must originate from the ABEC application." });
            return;
        }
        await next(context);
    }

    private async Task<bool> TrustedWriteAsync(HttpContext context, bool slot)
    {
        var request = context.Request;
        if (request.Headers.TryGetValue("Origin", out var origins))
        {
            if (origins.Count != 1) return false;
            if (TrustedOrigin(origins[0], request, false)) return true;
            // no-referrer can suppress a normal form POST's Origin. Never trust
            // the literal null origin: require the server-issued cookie/form pair.
            var sourceSite = request.Headers["Sec-Fetch-Site"].ToString();
            if (!slot || origins[0] != "null" || (sourceSite.Length != 0 && sourceSite != "same-origin")
                || !request.Cookies.ContainsKey(SlotActionPage.VerificationCookieName)) return false;
            if (request.Cookies.ContainsKey("abec-student-session"))
            {
                var session = await context.AuthenticateAsync("StudentSession");
                if (session.Principal is not null) context.User = session.Principal;
            }
            try
            {
                await context.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(context);
                return true;
            }
            catch (AntiforgeryValidationException) { return false; }
        }
        if (request.Headers.TryGetValue("Referer", out var referers))
            return referers.Count == 1 && TrustedOrigin(referers[0], request, true);
        var site = request.Headers["Sec-Fetch-Site"].ToString();
        if (site.Length != 0) return site is "same-origin" or "none";
        return !request.Cookies.ContainsKey("abec-student-session");
    }

    private bool TrustedOrigin(string? value, HttpRequest request, bool allowPath)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https") || uri.UserInfo.Length != 0
            || (!allowPath && (uri.AbsolutePath != "/" || uri.Query.Length != 0 || uri.Fragment.Length != 0))) return false;
        var origin = uri.GetLeftPart(UriPartial.Authority);
        if (string.Equals(origin, settings.CurrentValue.PublicBaseUrl.TrimEnd('/'), StringComparison.OrdinalIgnoreCase)) return true;
        if (!environment.IsDevelopment()) return false;
        return string.Equals(origin, request.Scheme + "://" + request.Host, StringComparison.OrdinalIgnoreCase)
            || DevelopmentOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase);
    }
}
