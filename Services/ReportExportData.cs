using ABEC_System.Constants;
using ABEC_System.Models;

namespace ABEC_System.Services;

public sealed record ReportExportScope(int? BatchId, string BatchName, int? CourseId, string CourseName)
{
    public string Description => $"Batch: {BatchName} | Course: {CourseName}";
}

public sealed record ReportExportRow(string FullName, string RecordId, string Course, string Batch,
    DateTime? Date, string StatusOrReason);

public sealed record ReportExportSection(string Title, string[] Columns, IReadOnlyList<ReportExportRow> Rows)
{
    // Both the summary and the table use this same materialized collection.
    public int Total => Rows.Count;
}

public sealed record ReportExportData(ReportExportScope Scope, DateTimeOffset ExportedAt,
    IReadOnlyList<ReportExportSection> Sections)
{
    public static ReportExportData Build(ReportExportScope scope, IEnumerable<Applicant> allApplicants,
        IEnumerable<Student> allStudents, DateTimeOffset? exportedAt = null)
    {
        var applicants = allApplicants.Where(a => (!scope.BatchId.HasValue || a.BatchId == scope.BatchId)
            && (!scope.CourseId.HasValue || a.CourseId == scope.CourseId)).ToList();
        var students = allStudents.Where(s => (!scope.BatchId.HasValue || s.BatchId == scope.BatchId)
            && (!scope.CourseId.HasValue || s.Applicant?.CourseId == scope.CourseId)).ToList();
        var enrolled = students.Where(s => s.Archives.Count == 0).Select(s => new ReportExportRow(
            Text(s.Applicant?.FullName), $"Student {s.StudentId}", Text(s.Applicant?.Course?.CourseName),
            Text(s.Batch?.BatchName), Date(s.CreatedAt), s.AccountStatus == SystemConstants.AccountStatuses.Active
                ? "Enrolled (account active)" : "Enrolled (" + Text(s.AccountStatus) + " account)"));
        var applications = applicants.Select(a => new ReportExportRow(Text(a.FullName), $"Application {a.ApplicantId}",
            Text(a.Course?.CourseName), Text(a.Batch?.BatchName), Date(a.ApplicationDate), Text(a.ApplicationStatus)));
        var archived = students.Where(s => s.Archives.Count != 0).Select(s =>
        {
            // Match the Archives chart: one latest saved archive record per student.
            var archive = s.Archives.OrderByDescending(a => a.ArchiveDate).ThenByDescending(a => a.ArchiveId).First();
            return new ReportExportRow(Text(s.Applicant?.FullName), $"Student {s.StudentId}",
                Text(s.Applicant?.Course?.CourseName), Text(s.Batch?.BatchName), Date(archive.ArchiveDate),
                ArchiveReason(archive));
        }).ToList();
        // Rejected/declined applications without a student account are part of the Archives chart too.
        archived.AddRange(applicants.Where(a => a.Student is null && ArchiveCategoryStatistics.IsRejectedSlot(
            new(a.ApplicantId, a.BatchId, a.CourseId, a.ApplicationStatus, a.SlotResponse, a.DeclinedAt, false)))
            .Select(a => new ReportExportRow(Text(a.FullName), $"Application {a.ApplicantId}",
                Text(a.Course?.CourseName), Text(a.Batch?.BatchName), a.DeclinedAt,
                "Rejected Slots - " + a.ApplicationStatus + " application")));

        ReportExportRow[] Sort(IEnumerable<ReportExportRow> rows) => rows.OrderBy(r => r.FullName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(r => r.RecordId, StringComparer.Ordinal).ToArray();
        return new(scope, exportedAt ?? DateTimeOffset.UtcNow,
        [
            new("Enrolled Students", ["Full name", "Student ID", "Course", "Batch", "Enrollment date", "Enrollment status"], Sort(enrolled)),
            new("Applicants", ["Full name", "Application ID", "Applied course", "Batch", "Application date", "Current application status"], Sort(applications)),
            new("Archived Records", ["Full name", "Student or application ID", "Course", "Batch", "Archive date", "Reason for archiving"], Sort(archived))
        ]);
    }

    private static string Text(string? value) => string.IsNullOrWhiteSpace(value) ? "Not recorded" : value.Trim();
    private static DateTime? Date(DateTime value) => value == default ? null : value;
    private static string ArchiveReason(Archive archive)
    {
        var canonical = SystemConstants.ArchiveReasons.Normalize(archive.ArchiveReason);
        if (canonical == SystemConstants.ArchiveReasons.Other)
            return string.IsNullOrWhiteSpace(archive.SpecificReason) ? "Others" : "Others - " + archive.SpecificReason.Trim();
        return Text(canonical ?? archive.ArchiveReason);
    }
}
