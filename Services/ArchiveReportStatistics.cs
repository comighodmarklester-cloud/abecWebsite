namespace ABEC_System.Services;

public sealed record ArchiveReportEntry(int ArchiveId, int StudentId, int BatchId, string Reason, DateTime Date);
public sealed record ArchiveReasonCount(string Reason, int Count);
public sealed record ArchiveReportStatistics(int? BatchId, string BatchName, int TotalArchivedStudents, IReadOnlyList<ArchiveReasonCount> Reasons)
{
    public static ArchiveReportStatistics Build(IEnumerable<ArchiveReportEntry> records, int? batchId, string batchName)
    {
        var latest = records.Where(r => !batchId.HasValue || r.BatchId == batchId.Value)
            .GroupBy(r => r.StudentId).Select(g => g.OrderByDescending(r => r.Date).ThenByDescending(r => r.ArchiveId).First()).ToList();
        string Canonical(string reason)
        {
            reason = reason.Trim();
            if (reason.Length == 0 || reason.Equals("Others", StringComparison.OrdinalIgnoreCase)) return "Other";
            return new[] { "Graduated", "Deactivated", "Academic Dismissal", "Withdrawal", "Inactive Lead", "Other" }
                .FirstOrDefault(r => r.Equals(reason, StringComparison.OrdinalIgnoreCase)) ?? reason;
        }
        var counts = latest.GroupBy(r => Canonical(r.Reason), StringComparer.OrdinalIgnoreCase)
            .OrderBy(g => g.Key).Select(g => new ArchiveReasonCount(g.Key, g.Count())).ToList();
        return new(batchId, batchName, latest.Count, counts);
    }
}
