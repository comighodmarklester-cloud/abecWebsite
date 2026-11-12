using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Data;

public static partial class DbSeeder
{
    // Additive, idempotent upgrade. Never rewrites contact details or assigns unknown batches.
    public static async Task EnsureBatchIntegritySchemaAsync(ApplicationDbContext db, CancellationToken ct = default)
    {
        await db.Database.OpenConnectionAsync(ct);
        var connection = db.Database.GetDbConnection();
        try
        {
            await AddColumnIfMissingAsync(db, "notifications", "request_id", "INT NULL", ct);
            await using var command = connection.CreateCommand();
            command.CommandText = "SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='notifications' AND COLUMN_NAME='request_id' AND REFERENCED_TABLE_NAME='documentrequests'";
            if (Convert.ToInt32(await command.ExecuteScalarAsync(ct)) == 0)
            {
                command.CommandText = "ALTER TABLE notifications ADD CONSTRAINT fk_notification_request FOREIGN KEY(request_id) REFERENCES documentrequests(request_id) ON DELETE SET NULL";
                await command.ExecuteNonQueryAsync(ct);
            }
            // Use the same guarded upgrade as EF/standalone SQL so startup cannot diverge.
            foreach (var sql in BatchLifecycleUpgrade.Statements)
                await db.Database.ExecuteSqlRawAsync(sql, ct);
        }
        finally { await db.Database.CloseConnectionAsync(); }
    }
}
