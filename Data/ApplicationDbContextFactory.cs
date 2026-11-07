using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace ABEC_System.Data;

// EF tooling must not start the web app or run its startup database upgrades.
public sealed class ApplicationDbContextFactory : IDesignTimeDbContextFactory<ApplicationDbContext>
{
    public ApplicationDbContext CreateDbContext(string[] args)
    {
        var environment = Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT")
            ?? Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")
            ?? Environments.Production;

        var configuration = new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json", optional: true)
            .AddJsonFile($"appsettings.{environment}.json", optional: true)
            .AddJsonFile("smtp.local.json", optional: true);

        if (environment == Environments.Development)
            configuration.AddUserSecrets<ApplicationDbContextFactory>(optional: true);

        var connectionString = configuration.AddEnvironmentVariables().Build()
            .GetConnectionString("DefaultConnection");
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException(
                "Set ConnectionStrings__DefaultConnection before running EF database commands.");

        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            // Match the application's MySQL 8 baseline without opening a connection at design time.
            .UseMySql(connectionString, new MySqlServerVersion(new Version(8, 0, 36)))
            .Options;

        return new ApplicationDbContext(options);
    }
}
