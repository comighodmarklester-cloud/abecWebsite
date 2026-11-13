using ABEC_System.Data;
using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Services;

public sealed class ApplicationReadiness
{
    private int _schemaReady;
    public bool SchemaReady => Volatile.Read(ref _schemaReady) == 1;
    public void MarkSchemaReady() => Interlocked.Exchange(ref _schemaReady, 1);

    public ReadinessStatus Snapshot(bool database) => new(database && SchemaReady, "ABEC System", database, SchemaReady);

    public async Task<IResult> CheckAsync(ApplicationDbContext db, CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(5));
        var database = false;
        try { database = await db.Database.CanConnectAsync(timeout.Token); }
        catch (Exception) { /* An unavailable database is unhealthy, not a successful readiness probe. */ }
        var status = Snapshot(database);
        return Results.Json(status, statusCode: status.Ok ? StatusCodes.Status200OK : StatusCodes.Status503ServiceUnavailable);
    }
}

public sealed record ReadinessStatus(bool Ok, string Service, bool Database, bool SchemaReady);
