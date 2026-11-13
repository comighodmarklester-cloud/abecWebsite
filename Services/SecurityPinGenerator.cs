using System.Security.Cryptography;

namespace ABEC_System.Services;

internal static class SecurityPinGenerator
{
    // Keep PINs as text to preserve leading zeroes. Sixteen random digits provide
    // about 53 bits of entropy without exceeding the existing storage limit.
    public static string Generate()
    {
        return new string(Enumerable.Range(0, 16)
            .Select(_ => (char)('0' + RandomNumberGenerator.GetInt32(10))).ToArray());
    }
}
