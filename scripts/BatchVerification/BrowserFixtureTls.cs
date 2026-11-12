using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;

internal static class BrowserFixtureTls
{
    // Return ephemeral material over a private child-process pipe, never application logs or files.
    public static void Write()
    {
        using var key = RSA.Create(2048);
        var request = new CertificateRequest("CN=localhost", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        var names = new SubjectAlternativeNameBuilder(); names.AddDnsName("localhost"); names.AddIpAddress(System.Net.IPAddress.Loopback);
        request.CertificateExtensions.Add(names.Build());
        request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment, true));
        using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddHours(2));
        Console.Write(JsonSerializer.Serialize(new {
            key = key.ExportPkcs8PrivateKeyPem(), cert = certificate.ExportCertificatePem(),
            spki = Convert.ToBase64String(SHA256.HashData(key.ExportSubjectPublicKeyInfo()))
        }));
    }
}
