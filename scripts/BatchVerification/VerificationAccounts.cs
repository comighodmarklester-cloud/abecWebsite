using System.Security.Cryptography;

// Generated once per verification process; never reuse credentials across runs.
internal static class VerificationAccounts
{
    public static string AdminUsername { get; } = "verify" + Convert.ToHexString(RandomNumberGenerator.GetBytes(6)).ToLowerInvariant();
    public static string StudentUsername { get; } = "student" + Convert.ToHexString(RandomNumberGenerator.GetBytes(6)).ToLowerInvariant();
    public static string Password { get; } = Convert.ToBase64String(RandomNumberGenerator.GetBytes(36));
}
