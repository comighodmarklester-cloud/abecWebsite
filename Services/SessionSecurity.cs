using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using ABEC_System.Data;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Services;

// A changed password, PIN or account state invalidates previously issued session cookies.
public sealed class SessionSecurity(ApplicationDbContext db) : CookieAuthenticationEvents
{
    private const string VersionClaim = "abec-session-version";

    public override async Task SigningIn(CookieSigningInContext context)
    {
        var version = await VersionAsync(context.Principal, context.HttpContext.RequestAborted)
            ?? throw new InvalidOperationException("The account is not available for sign-in.");
        var identity = (ClaimsIdentity)context.Principal!.Identity!;
        foreach (var previous in identity.FindAll(VersionClaim).ToArray()) identity.RemoveClaim(previous);
        identity.AddClaim(new Claim(VersionClaim, version));
    }

    public override async Task ValidatePrincipal(CookieValidatePrincipalContext context)
    {
        if (!context.Request.Path.StartsWithSegments("/api") && !context.Request.Path.StartsWithSegments("/Admin")) return;
        var expected = await VersionAsync(context.Principal, context.HttpContext.RequestAborted);
        if (expected is null || !string.Equals(expected, context.Principal?.FindFirstValue(VersionClaim), StringComparison.Ordinal))
        {
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync("StudentSession");
        }
    }

    public override Task RedirectToLogin(RedirectContext<CookieAuthenticationOptions> context)
    { context.Response.StatusCode = 401; return Task.CompletedTask; }
    public override Task RedirectToAccessDenied(RedirectContext<CookieAuthenticationOptions> context)
    { context.Response.StatusCode = 403; return Task.CompletedTask; }

    public static Task RefreshAsync(HttpContext context) => context.SignInAsync("StudentSession",
        new ClaimsPrincipal(new ClaimsIdentity(context.User.Claims.Where(c => c.Type != VersionClaim), "StudentSession")));

    private async Task<string?> VersionAsync(ClaimsPrincipal? principal, CancellationToken ct)
    {
        if (!int.TryParse(principal?.FindFirstValue(ClaimTypes.NameIdentifier), out var id)) return null;
        string? material = null;
        if (principal!.IsInRole("Admin"))
            material = await db.Admins.AsNoTracking().Where(a => a.AdminId == id).Select(a => a.Password).SingleOrDefaultAsync(ct);
        else if (principal.IsInRole("Student"))
        {
            var student = await db.Students.AsNoTracking().Where(s => s.StudentId == id && s.AccountStatus == "Active")
                .Select(s => new { s.SecurityPin }).SingleOrDefaultAsync(ct);
            if (student is null) return null;
            var login = await db.StudentLoginCredentials.AsNoTracking().SingleOrDefaultAsync(c => c.StudentId == id, ct);
            material = System.Text.Json.JsonSerializer.Serialize(new { student.SecurityPin, PasswordHash = login?.PasswordHash, PasswordLoginEnabled = login?.PasswordLoginEnabled });
        }
        return material is null ? null : Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(material)));
    }
}
