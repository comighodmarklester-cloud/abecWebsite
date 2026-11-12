using System.Security.Cryptography;

namespace ABEC_System.Services;

internal static class SecurityPinGenerator
{
    // 80 bits of entropy, case-insensitive and within the existing 20-character storage limit.
    public static string Generate()
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        return "ABEC" + new string(Enumerable.Range(0, 16)
            .Select(_ => alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)]).ToArray());
    }
}
