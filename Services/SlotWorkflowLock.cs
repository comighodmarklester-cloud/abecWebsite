using System.Security.Cryptography;
using System.Text;
using ABEC_System.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace ABEC_System.Services;

// MySQL connection locks serialize app instances while approval commits before SMTP.
internal sealed class SlotWorkflowLock(ApplicationDbContext db, string name) : IAsyncDisposable
{
    private bool disposed;
    public static async Task<SlotWorkflowLock> AcquireAsync(ApplicationDbContext db, string resource, CancellationToken ct)
    {
        await db.Database.OpenConnectionAsync(ct);
        var database = db.Database.GetDbConnection().Database;
        var name = "abec:" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(database)))[..16] + ":" + resource;
        var lease = new SlotWorkflowLock(db, name);
        try
        {
            if (Convert.ToInt32(await lease.CommandAsync("SELECT GET_LOCK(@name, 10)", ct)) != 1)
                throw new BatchIntegrityException("This application is already being processed. Refresh and try again shortly.");
            return lease;
        }
        catch { await lease.DisposeAsync(); throw; }
    }

    private async Task<object?> CommandAsync(string sql, CancellationToken ct)
    {
        await using var command = db.Database.GetDbConnection().CreateCommand();
        command.Transaction = db.Database.CurrentTransaction?.GetDbTransaction();
        command.CommandText = sql;
        var parameter = command.CreateParameter(); parameter.ParameterName = "@name"; parameter.Value = name;
        command.Parameters.Add(parameter);
        return await command.ExecuteScalarAsync(ct);
    }

    public async ValueTask DisposeAsync()
    {
        if (disposed) return;
        disposed = true;
        try { await CommandAsync("SELECT RELEASE_LOCK(@name)", CancellationToken.None); }
        finally { await db.Database.CloseConnectionAsync(); }
    }
}
