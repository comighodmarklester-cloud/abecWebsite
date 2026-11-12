using ABEC_System.Options;
using ABEC_System.Services;

internal static class PublicUrlChecks
{
    public static void Run()
    {
        var checks = 0;
        void Check(bool ok, string message) { if (!ok) throw new Exception(message); checks++; }
        foreach (var bad in new[] { "http://localhost:5188", "https://localhost", "https://test.localhost", "https://127.0.0.2", "https://10.1.2.3", "https://192.168.1.1", "https://[::1]", "https://[fc00::1]", "https://[::ffff:127.0.0.1]", "https://0.0.0.0", "http://abec.example.com", "https://abec.example.com/path", "https://abec.example.com?next=1", "https://user:pass@abec.example.com", "https://abec.example.com#fragment" })
            Check(!PublicAppUrl.IsPublicHttps(bad), "Invalid production origin accepted: " + bad);
        Check(PublicAppUrl.Normalize("http://localhost:5188/", true) == "http://localhost:5188", "Development can use its own local server.");
        Check(PublicAppUrl.Normalize(AppSettings.DefaultProductionBaseUrl + "/", false) == AppSettings.DefaultProductionBaseUrl, "Production uses the confirmed HTTPS origin.");
        var local = new AppSettings { PublicBaseUrl = "http://localhost:5188" };
        PublicAppUrl.ApplyProductionDefaults(local, false);
        Check(local.PublicBaseUrl == AppSettings.DefaultProductionBaseUrl, "Legacy localhost deployment setting must upgrade to the confirmed public site.");
        var custom = new AppSettings { PublicBaseUrl = "https://enroll.abec.example.com" };
        PublicAppUrl.ApplyProductionDefaults(custom, false);
        Check(custom.PublicBaseUrl == "https://enroll.abec.example.com", "A configured public custom domain must take precedence.");
        var development = new AppSettings { PublicBaseUrl = "http://localhost:5188" };
        PublicAppUrl.ApplyProductionDefaults(development, true);
        Check(development.PublicBaseUrl == "http://localhost:5188", "Local testing must not redirect its offers to production.");
        Console.WriteLine($"PASS {checks} public email URL policy checks.");
    }
}
