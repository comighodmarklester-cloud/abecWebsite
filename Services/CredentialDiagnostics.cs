namespace ABEC_System.Services;

// MySQL duplicate-key exception text can contain the rejected credential even
// when EF sensitive-data logging is off. Suppress provider diagnostics only for
// the credential write's async flow; other requests retain normal diagnostics.
public static class CredentialDiagnostics
{
    private static readonly AsyncLocal<bool> CredentialWrite = new();
    public static bool ShouldLog(string? category) => !CredentialWrite.Value
        || category?.StartsWith("Microsoft.EntityFrameworkCore", StringComparison.Ordinal) != true;

    internal static IDisposable BeginWrite()
    {
        var previous = CredentialWrite.Value;
        CredentialWrite.Value = true;
        return new Scope(previous);
    }
    private sealed class Scope(bool previous) : IDisposable
    {
        public void Dispose() => CredentialWrite.Value = previous;
    }
}
