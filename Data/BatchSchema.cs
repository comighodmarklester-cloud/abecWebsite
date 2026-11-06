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
            command.CommandText = "SELECT COUNT(*) FROM applicants WHERE batch_id IS NULL";
            if (Convert.ToInt32(await command.ExecuteScalarAsync(ct)) != 0)
                throw new InvalidOperationException("Batch upgrade requires explicit batch assignments for legacy applicants. No historical records were changed.");
            command.CommandText = "SELECT COUNT(*) FROM students s JOIN applicants a ON a.applicant_id=s.applicant_id WHERE s.batch_id<>a.batch_id";
            if (Convert.ToInt32(await command.ExecuteScalarAsync(ct)) != 0)
                throw new InvalidOperationException("Batch upgrade found conflicting student/applicant batches. Resolve those assignments before upgrading; no records were changed.");

            const string phone = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(contact_number), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '')";
            const string normalized = "CASE WHEN LENGTH(" + phone + ")=12 AND LEFT(" + phone + ",2)='63' THEN CONCAT('0',SUBSTRING(" + phone + ",3)) ELSE " + phone + " END";
            command.CommandText = "SELECT COUNT(*) FROM (SELECT batch_id FROM applicants GROUP BY batch_id, LOWER(TRIM(email)) HAVING COUNT(*)>1) duplicates";
            if (Convert.ToInt32(await command.ExecuteScalarAsync(ct)) != 0)
                throw new InvalidOperationException("Batch upgrade found duplicate emails within a batch. Resolve duplicates before upgrading; no records were deleted.");
            command.CommandText = "SELECT COUNT(*) FROM (SELECT batch_id FROM applicants GROUP BY batch_id," + normalized + " HAVING COUNT(*)>1) duplicates";
            if (Convert.ToInt32(await command.ExecuteScalarAsync(ct)) != 0)
                throw new InvalidOperationException("Batch upgrade found duplicate contact numbers within a batch. Resolve duplicates before upgrading; no records were deleted.");

            await AddColumnIfMissingAsync(db, "applicants", "batch_contact_key", "VARCHAR(20) GENERATED ALWAYS AS (" + normalized + ") STORED", ct);
            await AddColumnIfMissingAsync(db, "applicants", "batch_email_key", "VARCHAR(100) GENERATED ALWAYS AS (LOWER(TRIM(email))) STORED", ct);
            foreach (var item in new[] { (Name: "ux_batch_contact_key", Column: "batch_contact_key"), (Name: "ux_batch_email_key", Column: "batch_email_key") })
            {
                command.CommandText = "SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='applicants' AND INDEX_NAME=@index";
                command.Parameters.Clear();
                var parameter = command.CreateParameter(); parameter.ParameterName = "@index"; parameter.Value = item.Name; command.Parameters.Add(parameter);
                if (Convert.ToInt32(await command.ExecuteScalarAsync(ct)) == 0)
                {
                    command.Parameters.Clear();
                    // Both identifiers are fixed constants above, never caller input.
                    command.CommandText = $"CREATE UNIQUE INDEX `{item.Name}` ON applicants(batch_id, `{item.Column}`)";
                    await command.ExecuteNonQueryAsync(ct);
                }
            }
            // Remove only old single-column contact/email unique indexes after replacements exist.
            command.Parameters.Clear();
            command.CommandText = "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='applicants' AND NON_UNIQUE=0 AND INDEX_NAME<>'PRIMARY' GROUP BY INDEX_NAME HAVING COUNT(*)=1 AND MAX(COLUMN_NAME) IN ('email','contact_number')";
            var oldIndexes = new List<string>();
            await using (var reader = await command.ExecuteReaderAsync(ct))
                while (await reader.ReadAsync(ct)) oldIndexes.Add(reader.GetString(0));
            foreach (var name in oldIndexes)
            {
                command.CommandText = "ALTER TABLE applicants DROP INDEX `" + name.Replace("`", "``") + "`";
                await command.ExecuteNonQueryAsync(ct);
            }
        }
        finally { await db.Database.CloseConnectionAsync(); }
    }
}
