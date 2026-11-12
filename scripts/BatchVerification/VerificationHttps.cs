using System.Diagnostics;
using System.Net;
using System.Net.Security;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using ABEC_System.Options;

internal sealed class VerificationHttps : IDisposable
{
    private readonly X509Certificate2 certificate;
    private readonly string path;
    public string CertificatePath { get; }
    public string Spki { get; }
    private readonly string password = Guid.NewGuid().ToString("N");
    public VerificationHttps(string root)
    {
        Directory.CreateDirectory(root);
        using var key = RSA.Create(2048);
        var request = new CertificateRequest("CN=localhost", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        var names = new SubjectAlternativeNameBuilder(); names.AddDnsName("localhost"); names.AddIpAddress(IPAddress.Loopback);
        request.CertificateExtensions.Add(names.Build());
        request.CertificateExtensions.Add(new X509BasicConstraintsExtension(true, false, 0, true));
        request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment | X509KeyUsageFlags.KeyCertSign, true));
        certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddHours(2));
        Spki = Convert.ToBase64String(SHA256.HashData(key.ExportSubjectPublicKeyInfo()));
        path = Path.Combine(root, "verification-" + Guid.NewGuid().ToString("N") + ".pfx");
        File.WriteAllBytes(path, certificate.Export(X509ContentType.Pfx, password));
        CertificatePath = Path.ChangeExtension(path, ".crt");
        File.WriteAllText(CertificatePath, certificate.ExportCertificatePem());
    }
    public void Configure(ProcessStartInfo start)
    {
        start.Environment["Kestrel__Certificates__Default__Path"] = path;
        start.Environment["Kestrel__Certificates__Default__Password"] = password;
    }
    public HttpClient Client(Uri origin)
    {
        if (!origin.IsLoopback || origin.Scheme != Uri.UriSchemeHttps)
            throw new ArgumentException("Verification clients require a loopback HTTPS origin.", nameof(origin));
        var trust = new X509ChainPolicy { TrustMode = X509ChainTrustMode.CustomRootTrust };
        trust.CustomTrustStore.Add(certificate);
        var handler = new SocketsHttpHandler { CookieContainer = new CookieContainer(), AllowAutoRedirect = false,
            SslOptions = new SslClientAuthenticationOptions { CertificateChainPolicy = trust } };
        var client = new HttpClient(handler) { BaseAddress = origin, Timeout = TimeSpan.FromSeconds(40) };
        client.DefaultRequestHeaders.Add("Origin", AppSettings.DefaultProductionBaseUrl);
        return client;
    }
    public void Dispose() { certificate.Dispose(); File.Delete(path); File.Delete(CertificatePath); }
}
