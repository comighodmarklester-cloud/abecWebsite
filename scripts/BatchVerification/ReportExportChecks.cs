using System.Text.Json;
using ABEC_System.Controllers;
using ABEC_System.Models;
using ABEC_System.Services;
using Microsoft.AspNetCore.Mvc;

internal static class ReportExportChecks
{
    public static async Task Run()
    {
        var checks = 0;
        void Check(bool condition, string message) { if (!condition) throw new Exception(message); checks++; }
        var date = new DateTime(2026, 11, 1);
        Batch[] batches = [new() { BatchId = 1, BatchName = "Batch2026-101" }, new() { BatchId = 2, BatchName = "Batch2026-102" }];
        Course[] courses = [new() { CourseId = 1, CourseName = "Computer Systems Servicing NC II" }, new() { CourseId = 2, CourseName = "Bookkeeping NC III" }];
        var applicants = new List<Applicant>();
        var students = new List<Student>();
        for (var i = 1; i <= 180; i++)
        {
            var batch = batches[i <= 140 ? 0 : 1];
            var course = courses[i % 3 == 0 ? 1 : 0];
            var applicant = new Applicant { ApplicantId = i, FirstName = "Applicant" + i.ToString("D3"), MiddleName = "Maria",
                LastName = "Dela Cruz", Suffix = "Jr.", BatchId = batch.BatchId, Batch = batch, CourseId = course.CourseId, Course = course,
                ApplicationDate = date, ApplicationStatus = i <= 120 ? "Confirmed Slot" : i % 3 == 0 ? "Rejected" : i % 3 == 1 ? "Declined" : "Pending",
                DeclinedAt = i > 120 && i % 3 == 1 ? date.AddDays(2) : null, Email = "DO_NOT_EXPORT_EMAIL", ContactNumber = "DO_NOT_EXPORT_PHONE" };
            applicants.Add(applicant);
            if (i > 120) continue;
            var student = new Student { StudentId = 1000 + i, ApplicantId = i, Applicant = applicant,
                BatchId = batch.BatchId, Batch = batch, CreatedAt = date.AddDays(1),
                AccountStatus = i % 2 == 0 ? "Active" : "Inactive", SecurityPin = "DO_NOT_EXPORT_PIN" };
            applicant.Student = student;
            students.Add(student);
            if (i <= 70) continue;
            student.Archives.Add(new() { ArchiveId = i, StudentId = student.StudentId, ArchiveReason = "Graduated", ArchiveDate = date });
            student.Archives.Add(new() { ArchiveId = i + 1000, StudentId = student.StudentId, ArchiveReason = "Others",
                SpecificReason = i == 71 ? new string('L', 450) + " MOVED_OUTSIDE_PROVINCE" : "Family relocation - " + i,
                ArchiveDate = date.AddDays(3) });
        }
        applicants[0].FirstName = "José";
        applicants[0].LastName = "Peña";
        var exportedAt = new DateTimeOffset(2026, 11, 10, 2, 30, 0, TimeSpan.Zero);
        ReportExportData Build(int? batchId, int? courseId) => ReportExportData.Build(new(batchId,
            batchId.HasValue ? batches.Single(b => b.BatchId == batchId).BatchName : "All Batches", courseId,
            courseId.HasValue ? courses.Single(c => c.CourseId == courseId).CourseName : "All Courses"), applicants, students, exportedAt);
        var all = Build(null, null);
        Check(all.Sections.Select(s => s.Title).SequenceEqual(new[] { "Enrolled Students", "Applicants", "Archived Records" }), "All three required sections exist in order.");
        Check(all.Sections.Select(s => s.Total).SequenceEqual(new[] { 70, 180, 90 }), "All records, including later table pages, must be exported.");
        Check(all.Sections[0].Rows.Any(r => r.FullName == "José Maria Peña Jr." && r.RecordId == "Student 1001" && r.Date == date.AddDays(1)), "Student row must preserve full name, suffix, ID and enrollment date.");
        Check(all.Sections[0].Rows.All(r => r.StatusOrReason.StartsWith("Enrolled (")), "Enrollment status is explicit, including inactive accounts that are still enrolled.");
        Check(all.Sections[1].Rows.Any(r => r.RecordId == "Application 180" && r.StatusOrReason == "Rejected" && r.Date == date), "Applications retain their own ID, date and current status.");
        Check(all.Sections[2].Rows.Count(r => r.RecordId == "Student 1071") == 1 && all.Sections[2].Rows.Single(r => r.RecordId == "Student 1071").StatusOrReason.Contains("MOVED_OUTSIDE_PROVINCE"), "Latest archive entry preserves the specific Others reason in full.");
        Check(all.Sections[2].Rows.All(r => r.StatusOrReason != "Graduated"), "Old archive entries must not inflate the chart's current totals.");
        Check(all.Sections[2].Rows.Single(r => r.RecordId == "Application 123").Date is null, "A rejected application must not invent an archive date.");
        Check(all.Sections[2].Rows.Single(r => r.RecordId == "Application 121").Date == date.AddDays(2), "A saved declined-offer date is retained.");
        foreach (var batchId in new int?[] { null, 1, 2 }) foreach (var courseId in new int?[] { null, 1, 2 })
        {
            var report = Build(batchId, courseId);
            var expectedApplicants = applicants.Where(a => (!batchId.HasValue || a.BatchId == batchId) && (!courseId.HasValue || a.CourseId == courseId)).ToList();
            var expectedStudents = students.Where(s => (!batchId.HasValue || s.BatchId == batchId) && (!courseId.HasValue || s.Applicant!.CourseId == courseId)).ToList();
            Check(report.Sections[0].Total == expectedStudents.Count(s => s.Archives.Count == 0), "Student rows obey the batch/course intersection.");
            Check(report.Sections[1].Total == expectedApplicants.Count, "Applicant rows obey the batch/course intersection.");
            var categories = ArchiveCategoryStatistics.Build(students.SelectMany(s => s.Archives.Select(a => new ArchiveCategoryEntry(
                a.ArchiveId, s.StudentId, s.ApplicantId, s.BatchId, s.Applicant!.CourseId, a.ArchiveReason, a.ArchiveDate))),
                applicants.Select(a => new RejectedSlotEntry(a.ApplicantId, a.BatchId, a.CourseId, a.ApplicationStatus, a.SlotResponse, a.DeclinedAt, a.Student is not null)),
                batchId, report.Scope.BatchName, courseId, report.Scope.CourseName);
            Check(report.Sections[2].Total == categories.TotalAccounts, "Archive export total must match the Reports chart for every filter combination.");
            Check(report.Sections.All(s => s.Total == s.Rows.Count && s.Rows.Select(r => r.RecordId).Distinct().Count() == s.Total), "Each section has one row per record and exact totals.");
        }
        var empty = ReportExportData.Build(new(99, "Empty batch", null, "All Courses"), applicants, students, exportedAt);
        Check(empty.Sections.All(s => s.Total == 0), "Empty scopes retain all three sections with zero totals.");
        foreach (var invalid in new[] { 0, -1 })
        {
            var controller = new BatchApiController(null!);
            Check(await controller.DownloadReport(invalid, null, null, null!, default) is BadRequestObjectResult, "Invalid route batch must not broaden the export.");
            Check(await controller.DownloadReport(null, invalid, null, null!, default) is BadRequestObjectResult, "Invalid query batch must not broaden the export.");
            Check(await controller.DownloadReport(null, null, invalid, null!, default) is BadRequestObjectResult, "Invalid course must not broaden the export.");
        }
        Check(await new BatchApiController(null!).DownloadReport(1, 2, null, null!, default) is BadRequestObjectResult, "Conflicting batch scopes must fail before querying.");
        var output = Path.GetFullPath("artifacts/report-export");
        Directory.CreateDirectory(output);
        foreach (var (name, report) in new[] { ("all-records", all), ("filtered-records", Build(1, 1)), ("empty-records", empty) })
        {
            var pdf = BatchReportPdf.Create(report);
            Check(pdf.Length > 1000 && System.Text.Encoding.ASCII.GetString(pdf, 0, 5) == "%PDF-", "Generate a real, nonempty PDF.");
            File.WriteAllBytes(Path.Combine(output, name + ".pdf"), pdf);
            File.WriteAllText(Path.Combine(output, name + ".json"), JsonSerializer.Serialize(report));
        }
        Console.WriteLine($"PASS: {checks} report export checks; generated synthetic PDFs in {output}; no database opened.");
    }
}
