using ABEC_System.Models;
using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Data;

public sealed class BatchIntegrityException(string message) : Exception(message);

public partial class ApplicationDbContext
{
    // Set only after verifying the authenticated student owns this request.
    internal int? HistoricalRequestStudentId { get; set; }

    public override async Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        await using var transaction = Database.CurrentTransaction is null
            ? await Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken) : null;
        await ValidateBatchWritesAsync(cancellationToken);
        var result = await base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return result;
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        using var transaction = Database.CurrentTransaction is null
            ? Database.BeginTransaction(System.Data.IsolationLevel.Serializable) : null;
        ValidateBatchWritesAsync(CancellationToken.None).GetAwaiter().GetResult();
        var result = base.SaveChanges(acceptAllChangesOnSuccess);
        transaction?.Commit();
        return result;
    }

    internal async Task RequireActiveBatchAsync(int? batchId, CancellationToken ct)
    {
        if (!batchId.HasValue || !await Batches.AsNoTracking().AnyAsync(b => b.BatchId == batchId && b.Status == "Active", ct))
            throw new BatchIntegrityException("This batch is completed or unassigned and is view-only. Select the active batch to make changes.");
    }

    public static string NormalizeContact(string value)
    {
        var digits = new string(value.Where(char.IsDigit).ToArray());
        return digits.StartsWith("63") && digits.Length == 12 ? "0" + digits[2..] : digits;
    }

    internal async Task ValidateContactAsync(Applicant applicant, CancellationToken ct)
    {
        var email = applicant.Email.Trim().ToLowerInvariant();
        var phone = NormalizeContact(applicant.ContactNumber);
        var others = await Applicants.AsNoTracking().Where(a => a.BatchId == applicant.BatchId && a.ApplicantId != applicant.ApplicantId)
            .Select(a => new { a.Email, a.ContactNumber }).ToListAsync(ct);
        if (others.Any(a => a.Email.Trim().Equals(email, StringComparison.OrdinalIgnoreCase)))
            throw new BatchIntegrityException("Another record in this batch already uses this email address.");
        if (others.Any(a => NormalizeContact(a.ContactNumber) == phone))
            throw new BatchIntegrityException("Another record in this batch already uses this contact number.");
    }

    private async Task ValidateBatchWritesAsync(CancellationToken ct)
    {
        ChangeTracker.DetectChanges();
        var changes = ChangeTracker.Entries().Where(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted).ToList();
        foreach (var entry in changes)
        {
            if (entry.State == EntityState.Modified && entry.Entity is DocumentRequest or StudentCourseDocument or Archive or ApplicantRegistrationDocument)
                foreach (var property in entry.Properties.Where(p => p.Metadata.IsForeignKey()))
                    if (property.IsModified)
                        throw new BatchIntegrityException("Existing historical records cannot be moved to another student, applicant or batch.");
            int? batchId = null;
            int? studentId = null;
            switch (entry.Entity)
            {
                case Applicant a:
                    batchId = a.BatchId;
                    if (entry.State != EntityState.Added && entry.Property(nameof(Applicant.BatchId)).IsModified)
                        throw new BatchIntegrityException("An existing applicant cannot be moved to another batch.");
                    if (entry.State != EntityState.Deleted) await ValidateContactAsync(a, ct);
                    break;
                case Student s:
                    batchId = s.BatchId;
                    if (entry.State != EntityState.Added && entry.Property(nameof(Student.BatchId)).IsModified)
                        throw new BatchIntegrityException("An existing student cannot be moved to another batch.");
                    var applicantBatch = await Applicants.AsNoTracking().Where(a => a.ApplicantId == s.ApplicantId).Select(a => a.BatchId).SingleAsync(ct);
                    if (applicantBatch != s.BatchId) throw new BatchIntegrityException("Student and applicant must belong to the same batch.");
                    break;
                case Archive a: studentId = a.StudentId; break;
                case DocumentRequest r:
                    studentId = r.StudentId;
                    if (entry.State == EntityState.Added && HistoricalRequestStudentId == r.StudentId) continue;
                    break;
                case Batch b when entry.State == EntityState.Deleted:
                    throw new BatchIntegrityException("Batches and their history must be preserved.");
                case StudentCourseDocument d: studentId = d.StudentId; break;
                case ApplicantRegistrationDocument d:
                    batchId = await Applicants.AsNoTracking().Where(a => a.ApplicantId == d.ApplicantId).Select(a => a.BatchId).SingleAsync(ct);
                    break;
                default: continue;
            }
            if (studentId.HasValue)
                batchId = await Students.AsNoTracking().Where(s => s.StudentId == studentId).Select(s => (int?)s.BatchId).SingleOrDefaultAsync(ct);
            await RequireActiveBatchAsync(batchId, ct);
        }
    }
}
