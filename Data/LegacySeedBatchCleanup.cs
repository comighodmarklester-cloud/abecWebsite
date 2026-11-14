using System.Data;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace ABEC_System.Data;

// Repair only the obsolete 2026 sample batch. Never hide rows or delete operational data.
public static class LegacySeedBatchCleanup
{
    public static async Task<string> ApplyAsync(ApplicationDbContext db, string backupRoot, CancellationToken ct = default)
    {
        if (!await db.Batches.AsNoTracking().AnyAsync(b => b.BatchName == "Batch2026-A" || b.BatchName == "Batch 2026-A", ct))
            return "Absent";

        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        // Parent locks prevent batch switches and concurrent FK inserts until commit.
        var batches = await db.Batches.FromSqlRaw("SELECT * FROM batches FOR UPDATE").AsNoTracking().ToListAsync(ct);
        var targets = batches.Where(b => b.BatchName is "Batch2026-A" or "Batch 2026-A").ToList();
        if (targets.Count == 0) return "Absent";
        if (targets.Count != 1) return "Skipped: ambiguous sample batch names";
        var target = targets[0];
        if (target.Status is not ("Completed" or "Closed")) return "Skipped: sample batch is not completed";
        if (target.StartDate.Date != new DateTime(2026, 1, 1) || target.EndDate.Date != new DateTime(2026, 12, 31))
            return "Skipped: dates do not match the original sample batch";
        if (batches.Count(b => b.BatchName == "Batch2026-101" && b.Status == "Completed") != 1
            || batches.Count(b => b.BatchName == "Batch2026-102" && b.Status == "Active") != 1
            || batches.Count(b => b.Status == "Active") != 1)
            return "Skipped: expected completed and current batches must be preserved";

        await using var command = db.Database.GetDbConnection().CreateCommand();
        command.Transaction = transaction.GetDbTransaction();
        // Unknown cascading history relationships or DELETE triggers require manual review.
        command.CommandText = """
            SELECT (SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
              WHERE REFERENCED_TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME='batchhistory')
              + (SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
                 WHERE REFERENCED_TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME='batches'
                   AND (TABLE_SCHEMA<>DATABASE() OR REFERENCED_COLUMN_NAME<>'batch_id'))
              + (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()
                 AND EVENT_OBJECT_TABLE IN ('batches','batchhistory') AND EVENT_MANIPULATION='DELETE')
            """;
        if (Convert.ToInt64(await command.ExecuteScalarAsync(ct)) != 0)
            return "Skipped: unfamiliar dependencies or delete triggers require review";

        // Include both declared foreign keys (even differently named columns) and
        // legacy batch_id columns without constraints. Do not rely on UI student counts.
        command.CommandText = """
            SELECT c.TABLE_NAME, c.COLUMN_NAME FROM information_schema.COLUMNS c
            JOIN information_schema.TABLES t ON t.TABLE_SCHEMA=c.TABLE_SCHEMA AND t.TABLE_NAME=c.TABLE_NAME
            WHERE c.TABLE_SCHEMA=DATABASE() AND c.COLUMN_NAME='batch_id' AND t.TABLE_TYPE='BASE TABLE'
            UNION
            SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_SCHEMA=DATABASE()
              AND REFERENCED_TABLE_NAME='batches'
            """;
        var references = new List<(string Table, string Column)>();
        await using (var reader = await command.ExecuteReaderAsync(ct))
            while (await reader.ReadAsync(ct)) references.Add((reader.GetString(0), reader.GetString(1)));
        var parameter = command.CreateParameter(); parameter.ParameterName = "@batchId"; parameter.Value = target.BatchId;
        command.Parameters.Add(parameter);
        foreach (var (table, column) in references)
        {
            if (column.Equals("batch_id", StringComparison.OrdinalIgnoreCase)
                && (table.Equals("batches", StringComparison.OrdinalIgnoreCase) || table.Equals("batchhistory", StringComparison.OrdinalIgnoreCase))) continue;
            command.CommandText = $"SELECT COUNT(*) FROM {Quote(table)} WHERE {Quote(column)}=@batchId";
            if (Convert.ToInt64(await command.ExecuteScalarAsync(ct)) != 0)
                return "Skipped: sample batch has linked records";
        }

        var history = await db.BatchHistories.AsNoTracking().Where(h => h.BatchId == target.BatchId).ToListAsync(ct);
        // Save exact empty-batch metadata outside the public web root before deletion.
        Directory.CreateDirectory(backupRoot);
        var backup = Path.Combine(backupRoot, $"batch-{target.BatchId}-{Guid.NewGuid():N}.json");
        await using (var file = new FileStream(backup, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            await JsonSerializer.SerializeAsync(file, new { Batch = target, History = history }, cancellationToken: ct);
        await db.BatchHistories.Where(h => h.BatchId == target.BatchId).ExecuteDeleteAsync(ct);
        if (await db.Batches.Where(b => b.BatchId == target.BatchId && b.BatchName == target.BatchName && b.Status == target.Status).ExecuteDeleteAsync(ct) != 1)
            throw new InvalidOperationException("Legacy sample batch changed during cleanup.");
        await transaction.CommitAsync(ct);
        return "Removed empty legacy sample batch; completed and current batches preserved";
    }

    private static string Quote(string identifier) => "`" + identifier.Replace("`", "``") + "`";
}
