namespace ABEC_System.Services;

// MIME types are derived from the stored extension and verified bytes, never upload headers or DB MIME fields.
public static class UploadedDocument
{
    public static string? ContentType(string? path) => Path.GetExtension(path ?? "").ToLowerInvariant() switch
    {
        ".pdf" => "application/pdf",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        _ => null
    };

    public static async Task<(Stream? Stream, string? ContentType)> OpenAsync(string root, string relativePath, CancellationToken ct)
    {
        if (Path.IsPathRooted(relativePath)) return (null, null);
        var directory = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        var path = Path.GetFullPath(Path.Combine(directory, relativePath.Replace('/', Path.DirectorySeparatorChar)));
        var type = ContentType(path);
        var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        if (!path.StartsWith(directory, comparison) || type is null || !File.Exists(path)) return (null, null);
        var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        try
        {
            var valid = await HasSignatureAsync(stream, type, ct);
            if (valid) { stream.Position = 0; return (stream, type); }
        }
        catch { await stream.DisposeAsync(); throw; }
        await stream.DisposeAsync();
        return (null, null);
    }

    public static async Task<bool> HasSignatureAsync(Stream stream, string? contentType, CancellationToken ct)
    {
        var header = new byte[8];
        var read = await stream.ReadAtLeastAsync(header, 8, throwOnEndOfStream: false, cancellationToken: ct);
        return contentType switch
        {
            "application/pdf" => read >= 5 && header.AsSpan(0, 5).SequenceEqual("%PDF-"u8),
            "image/jpeg" => read >= 3 && header[0] == 0xff && header[1] == 0xd8 && header[2] == 0xff,
            "image/png" => read >= 8 && header.AsSpan().SequenceEqual(new byte[] { 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a }),
            _ => false
        };
    }
}
