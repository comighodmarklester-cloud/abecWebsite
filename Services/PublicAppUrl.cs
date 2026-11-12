using System.Net;
using System.Net.Sockets;
using ABEC_System.Options;

namespace ABEC_System.Services;

public static class PublicAppUrl
{
    public static void ApplyProductionDefaults(AppSettings settings, bool development)
    {
        // Replace the old local-only deployment default with the verified public site.
        // An explicitly configured public domain always takes precedence.
        if (!development && (string.IsNullOrWhiteSpace(settings.PublicBaseUrl)
            || (Uri.TryCreate(settings.PublicBaseUrl, UriKind.Absolute, out var uri) && IsLoopback(uri))))
            settings.PublicBaseUrl = AppSettings.DefaultProductionBaseUrl;
    }

    public static string Normalize(string? value, bool development)
    {
        if (!Uri.TryCreate(value?.Trim(), UriKind.Absolute, out var uri)
            || uri.Scheme is not ("http" or "https") || uri.UserInfo.Length != 0
            || uri.Query.Length != 0 || uri.Fragment.Length != 0 || uri.AbsolutePath != "/")
            throw new InvalidOperationException("App__PublicBaseUrl must be the full website origin, without a path, credentials, query or fragment.");
        if (!development && (uri.Scheme != "https" || IsPrivate(uri)))
            throw new InvalidOperationException("App__PublicBaseUrl must use the public HTTPS ABEC website in production; localhost and private addresses cannot be used in applicant emails.");
        return uri.GetLeftPart(UriPartial.Authority).TrimEnd('/');
    }

    public static bool IsPublicHttps(string? value)
    {
        try { Normalize(value, false); return true; }
        catch (InvalidOperationException) { return false; }
    }

    private static bool IsLoopback(Uri uri) => uri.IsLoopback || uri.IdnHost.TrimEnd('.').Equals("localhost", StringComparison.OrdinalIgnoreCase)
        || uri.IdnHost.TrimEnd('.').EndsWith(".localhost", StringComparison.OrdinalIgnoreCase) || uri.IdnHost is "0.0.0.0" or "::" or "[::]";

    private static bool IsPrivate(Uri uri)
    {
        if (IsLoopback(uri)) return true;
        var host = uri.IdnHost.TrimEnd('.').Trim('[', ']');
        if (!IPAddress.TryParse(host, out var ip))
            return !host.Contains('.') || host.EndsWith(".local", StringComparison.OrdinalIgnoreCase);
        if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
        if (IPAddress.IsLoopback(ip) || ip.Equals(IPAddress.Any) || ip.Equals(IPAddress.IPv6Any)) return true;
        var bytes = ip.GetAddressBytes();
        if (ip.AddressFamily == AddressFamily.InterNetworkV6)
            return ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal || ip.IsIPv6Multicast || (bytes[0] & 0xfe) == 0xfc;
        return bytes[0] is 0 or 10 or 127 || bytes[0] >= 224
            || (bytes[0] == 172 && bytes[1] is >= 16 and <= 31)
            || (bytes[0] == 192 && bytes[1] == 168) || (bytes[0] == 169 && bytes[1] == 254)
            || (bytes[0] == 100 && bytes[1] is >= 64 and <= 127);
    }
}
