using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Data;

public static class SlotOfferDeadlineUpgrade
{
    // Recognize the previous policy from delivery timestamps, allowing for SMTP time.
    // A durable marker prevents subsequent startups from extending newer offers.
    public const string Sql = """
        UPDATE applicants a
        JOIN batches b ON b.batch_id = a.batch_id AND b.status = 'Active'
        SET a.response_deadline = DATE_ADD(a.response_deadline, INTERVAL 24 HOUR)
        WHERE a.application_status = 'Approved'
          AND a.confirmed_at IS NULL AND a.declined_at IS NULL
          AND a.approval_email_sent_at IS NOT NULL
          AND TIMESTAMPDIFF(SECOND, a.approval_email_sent_at, a.response_deadline) BETWEEN 82800 AND 86400
        """;

    public static async Task ApplyAsync(ApplicationDbContext db, CancellationToken ct = default)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS abec_data_upgrades (
                upgrade_name VARCHAR(100) NOT NULL PRIMARY KEY,
                applied_at DATETIME NOT NULL
            ) ENGINE=InnoDB
            """, ct);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var added = await db.Database.ExecuteSqlRawAsync("""
            INSERT IGNORE INTO abec_data_upgrades(upgrade_name, applied_at)
            VALUES ('slot-offer-48-hours-v1', UTC_TIMESTAMP())
            """, ct);
        if (added == 1) await db.Database.ExecuteSqlRawAsync(Sql, ct);
        await transaction.CommitAsync(ct);
    }
}
