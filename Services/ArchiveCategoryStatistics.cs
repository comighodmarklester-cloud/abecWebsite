using ABEC_System.Constants;

namespace ABEC_System.Services;

public sealed record ArchiveCategoryEntry(int ArchiveId, int StudentId, int? ApplicantId, int BatchId,
    int CourseId, string Reason, DateTime Date);
public sealed record RejectedSlotEntry(int ApplicantId, int? BatchId, int CourseId, string ApplicationStatus,
    string? SlotResponse, DateTime? DeclinedAt, bool HasStudent);
public sealed record ArchiveCategoryStatistics(int? BatchId, string BatchName, int? CourseId, string CourseName,
    int TotalAccounts, IReadOnlyList<ArchiveReasonCount> Categories)
{
    public static readonly string[] CategoryNames =
        ["Graduated", "Deactivated", "Academic Dismissal", "Withdrawal", "Inactive Lead", "Rejected Slots", "Others"];

    public static ArchiveCategoryStatistics Build(IEnumerable<ArchiveCategoryEntry> archives,
        IEnumerable<RejectedSlotEntry> applicants, int? batchId, string batchName, int? courseId, string courseName)
    {
        var latest = archives.GroupBy(a => a.StudentId)
            .Select(g => g.OrderByDescending(a => a.Date).ThenByDescending(a => a.ArchiveId).First())
            .Where(a => (!batchId.HasValue || a.BatchId == batchId) && (!courseId.HasValue || a.CourseId == courseId)).ToList();
        var counts = CategoryNames.ToDictionary(name => name, _ => 0);
        foreach (var row in latest)
        {
            var reason = SystemConstants.ArchiveReasons.Normalize(row.Reason);
            counts[reason is null or "Other" ? "Others" : reason]++;
        }
        var archivedApplicants = latest.Where(a => a.ApplicantId.HasValue).Select(a => a.ApplicantId!.Value).ToHashSet();
        counts["Rejected Slots"] += applicants.Where(a => !a.HasStudent && !archivedApplicants.Contains(a.ApplicantId)
                && (!batchId.HasValue || a.BatchId == batchId) && (!courseId.HasValue || a.CourseId == courseId)
                && IsRejectedSlot(a))
            .Select(a => a.ApplicantId).Distinct().Count();
        return new(batchId, batchName, courseId, courseName, counts.Values.Sum(),
            CategoryNames.Select(name => new ArchiveReasonCount(name, counts[name])).ToList());
    }

    // Rejected applications and declined offers remain stored as applicants, outside student archives.
    public static bool IsRejectedSlot(RejectedSlotEntry applicant)
        => string.Equals(applicant.ApplicationStatus, SystemConstants.ApplicationStatuses.Declined, StringComparison.OrdinalIgnoreCase)
            || string.Equals(applicant.ApplicationStatus, SystemConstants.ApplicationStatuses.Rejected, StringComparison.OrdinalIgnoreCase);
}
