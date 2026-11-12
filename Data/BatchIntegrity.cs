using ABEC_System.Models;
using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Data;

public sealed class BatchIntegrityException(string message, string? field = null) : Exception(message)
{
    public string? Field { get; } = field;
}

public partial class ApplicationDbContext
{
    // Set only after verifying the authenticated student owns this request.
    internal int? HistoricalRequestStudentId { get; set; }
    internal bool DocumentAdministration { get; set; }

    internal async Task RequireDocumentWriteAsync(int studentId, CancellationToken ct)
    {
        if (DocumentAdministration) return;
        await RequireActiveBatchAsync(await Students.Where(s => s.StudentId == studentId).Select(s => (int?)s.BatchId).SingleOrDefaultAsync(ct), ct);
    }

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
            throw new BatchIntegrityException("Another record in this batch already uses this email address.", "email");
        if (others.Any(a => NormalizeContact(a.ContactNumber) == phone))
            throw new BatchIntegrityException("Another record in this batch already uses this contact number.", "contactNumber");
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
                    var legacyConflict = entry.Property("LegacyContactConflict");
                    if ((entry.State == EntityState.Added && legacyConflict.CurrentValue is true) ||
                        (entry.State == EntityState.Modified && legacyConflict.IsModified))
                        throw new BatchIntegrityException("Historical contact exceptions can only be recorded by the reviewed migration.");
                    batchId = a.BatchId;
                    if (entry.State != EntityState.Added && entry.Property(nameof(Applicant.BatchId)).IsModified)
                        throw new BatchIntegrityException("An existing applicant cannot be moved to another batch.");
                    // Status/email-delivery updates do not change contact uniqueness. Reading
                    // every other applicant here made concurrent approvals deadlock on each other.
                    if (entry.State == EntityState.Added || (entry.State == EntityState.Modified &&
                        (entry.Property(nameof(Applicant.Email)).IsModified || entry.Property(nameof(Applicant.ContactNumber)).IsModified)))
                        await ValidateContactAsync(a, ct);
                    break;
                case Student s:
                    batchId = s.BatchId;
                    if (entry.State != EntityState.Added && (entry.Property(nameof(Student.BatchId)).IsModified || entry.Property(nameof(Student.ApplicantId)).IsModified))
                        throw new BatchIntegrityException("An existing student cannot be moved to another batch.");
                    var applicantBatch = await Applicants.AsNoTracking().Where(a => a.ApplicantId == s.ApplicantId).Select(a => a.BatchId).SingleAsync(ct);
                    if (applicantBatch != s.BatchId) throw new BatchIntegrityException("Student and applicant must belong to the same batch.");
                    break;
                case Archive a: studentId = a.StudentId; break;
                case DocumentRequest r:
                    studentId = r.StudentId;
                    if (DocumentAdministration) continue;
                    if (entry.State == EntityState.Added && HistoricalRequestStudentId == r.StudentId) continue;
                    break;
                case Batch b when entry.State == EntityState.Deleted:
                    throw new BatchIntegrityException("Batches and their history must be preserved.");
                case StudentCourseDocument d:
                    var documentOwner = await Students.Where(s => s.StudentId == d.StudentId)
                        .Select(s => new { s.BatchId, s.Applicant!.CourseId }).SingleAsync(ct);
                    if (d.BatchId != documentOwner.BatchId || d.CourseId != documentOwner.CourseId)
                        throw new BatchIntegrityException("Document batch and course must match the student's enrollment.", "batchId");
                    if (entry.State == EntityState.Modified &&
                        (entry.Property(nameof(StudentCourseDocument.BatchId)).IsModified || entry.Property(nameof(StudentCourseDocument.CourseId)).IsModified))
                        throw new BatchIntegrityException("A document cannot be reassigned to another batch or course.");
                    if (DocumentAdministration) continue;
                    studentId = d.StudentId; break;
                case CourseSchedule s:
                    if (entry.State == EntityState.Modified && entry.Property(nameof(CourseSchedule.BatchId)).IsModified)
                        throw new BatchIntegrityException("An existing schedule cannot be moved to another batch.", "batchId");
                    if (entry.State != EntityState.Added)
                        await RequireActiveBatchAsync((int)entry.Property(nameof(CourseSchedule.BatchId)).OriginalValue!, ct);
                    batchId = s.BatchId;
                    break;
                case Notification n:
                    var ownerBatch = n.StudentId.HasValue
                        ? await Students.Where(s => s.StudentId == n.StudentId).Select(s => (int?)s.BatchId).SingleOrDefaultAsync(ct)
                        : n.ApplicantId.HasValue
                            ? await Applicants.Where(a => a.ApplicantId == n.ApplicantId).Select(a => a.BatchId).SingleOrDefaultAsync(ct) : null;
                    if (n.BatchId.HasValue && ownerBatch.HasValue && n.BatchId != ownerBatch)
                        throw new BatchIntegrityException("Notification ownership does not match its batch.", "batchId");
                    continue;
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
