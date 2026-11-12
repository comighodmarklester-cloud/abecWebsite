using ABEC_System.Controllers;
using ABEC_System.Data;
using ABEC_System.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

internal static class ArchiveStatisticsChecks
{
    public static async Task RunReadOnly(ApplicationDbContext db)
    {
        var batchId = await db.Batches.AsNoTracking().OrderBy(b => b.BatchId).Select(b => (int?)b.BatchId).FirstOrDefaultAsync();
        var courseId = await db.Courses.AsNoTracking().OrderBy(c => c.CourseId).Select(c => (int?)c.CourseId).FirstOrDefaultAsync();
        var scopes = new[] { ((int?)null, (int?)null), (batchId, (int?)null), ((int?)null, courseId), (batchId, courseId) };
        var controller = new ArchiveController(null!);
        var archiveService = new ArchiveService(db, null!);
        var batchIds = await db.Batches.AsNoTracking().Select(b => b.BatchId).ToListAsync();
        var managementRecords = new List<ABEC_System.DTOs.ArchiveDto>();
        foreach (var id in batchIds)
        {
            var result = await archiveService.GetAllAsync(null, CancellationToken.None, id);
            managementRecords.AddRange(result.Data ?? throw new Exception("Archive management source could not be loaded."));
        }
        foreach (var (batch, course) in scopes)
        {
            var result = await controller.Categories(batch, course, db, CancellationToken.None) as OkObjectResult;
            var report = (result?.Value as ABEC_System.DTOs.ApiResponse<ArchiveCategoryStatistics>)?.Data
                ?? throw new Exception("Archive category query failed for a valid scope.");
            if (report.BatchId != batch || report.CourseId != course || report.Categories.Count != 7
                || report.TotalAccounts != report.Categories.Sum(c => c.Count))
                throw new Exception("Persisted category report has inconsistent scope or totals.");
            var studentIds = await db.Students.AsNoTracking()
                .Where(s => (!batch.HasValue || s.BatchId == batch)
                    && (!course.HasValue || (s.Applicant != null && s.Applicant.CourseId == course)))
                .Select(s => s.StudentId).ToListAsync();
            var latestManagementRecords = managementRecords.Where(a => studentIds.Contains(a.StudentId))
                .GroupBy(a => a.StudentId).Select(g => g.OrderByDescending(a => a.ArchiveDate).ThenByDescending(a => a.ArchiveId).First());
            var expected = latestManagementRecords.GroupBy(a =>
            {
                var reason = ABEC_System.Constants.SystemConstants.ArchiveReasons.Normalize(a.ArchiveReason);
                return reason is null or "Other" ? "Others" : reason;
            }).ToDictionary(g => g.Key, g => g.Count());
            foreach (var category in report.Categories.Where(c => c.Reason != "Rejected Slots"))
                if (category.Count != expected.GetValueOrDefault(category.Reason))
                    throw new Exception("Graph counts differ from the archive management account records.");
        }
        Console.WriteLine("PASS: 4 archive category scopes match the archive management account records; no records changed.");
    }

    public static async Task Run()
    {
        var count = 0;
        void Check(bool value, string message) { if (!value) throw new Exception(message); count++; }
        var day = new DateTime(2026, 11, 1);
        ArchiveReportEntry[] records = [new(1, 10, 1, "Graduated", day), new(2, 10, 1, "Withdrawal", day.AddDays(1)),
            new(3, 11, 1, "graduated", day), new(4, 20, 5, "", day), new(5, 20, 5, "Graduated", day)];
        var original = records.ToArray();
        var all = ArchiveReportStatistics.Build(records, null, "All Batches");
        Check(all.BatchId is null && all.BatchName == "All Batches", "Combined report must be explicitly labeled.");
        Check(all.TotalArchivedStudents == 3, "Each student must be counted once across all batches.");
        Check(all.Reasons.Single(r => r.Reason == "Graduated").Count == 2, "Reasons must normalize casing and use the latest entry.");
        Check(all.Reasons.Single(r => r.Reason == "Withdrawal").Count == 1, "Later archive status must replace earlier history in the graph.");
        var first = ArchiveReportStatistics.Build(records, 1, "Batch2026-101");
        Check(first.TotalArchivedStudents == 2 && first.BatchId == 1, "Selected batch must exclude other batches.");
        Check(first.Reasons.Sum(r => r.Count) == 2, "Reason totals must match the selected student total.");
        Check(ArchiveReportStatistics.Build(records, 5, "Batch2026-102").TotalArchivedStudents == 1, "A second batch must remain independent.");
        Check(ArchiveReportStatistics.Build(records, 8, "Empty").TotalArchivedStudents == 0, "Empty batches must have zero archives.");
        Check(ArchiveReportStatistics.Build([new(6, 30, 1, "Others", day)], 1, "Batch").Reasons.Single().Reason == "Other", "Legacy Other labels must normalize.");
        Check(records.SequenceEqual(original), "Reporting must preserve every source archive entry.");
        var serialized = System.Text.Json.JsonSerializer.Serialize(all);
        Check(!serialized.Contains("StudentId") && !serialized.Contains("ArchiveId"), "Combined endpoint must expose aggregate data only.");
        ArchiveCategoryEntry[] categoryRows =
        [
            new(1, 10, 100, 1, 1, "Graduated", day),
            new(2, 10, 100, 1, 1, "Withdrawal", day.AddDays(1)),
            new(3, 11, 101, 1, 2, "graduated", day),
            new(4, 20, 102, 5, 1, "Deactivated", day),
            new(5, 21, 103, 5, 2, "Academic Dismissal", day),
            new(6, 22, 104, 5, 1, "Inactive Lead", day),
            new(7, 23, 105, 1, 1, "Custom reason", day),
            new(8, 24, 106, 5, 2, "Other", day),
            new(9, 25, 107, 1, 1, "", day)
        ];
        RejectedSlotEntry[] slotRows =
        [
            new(200, 1, 1, "Rejected", null, null, false),
            new(201, 5, 2, "Rejected", "Declined", day, false),
            new(202, 5, 1, "Declined", null, day, false),
            new(203, 1, 1, "Expired", "Expired", null, false),
            new(204, 1, 1, "Approved", "AwaitingResponse", null, false),
            new(100, 1, 1, "Rejected", "Declined", day, false),
            new(205, 1, 1, "Rejected", null, null, true),
            new(200, 1, 1, "Rejected", null, null, false)
        ];
        var categories = ArchiveCategoryStatistics.Build(categoryRows, slotRows, null, "All Batches", null, "All Courses");
        Check(categories.Categories.Select(c => c.Reason).SequenceEqual(ArchiveCategoryStatistics.CategoryNames), "Graph categories must keep all seven labels in the requested order.");
        Check(categories.TotalAccounts == 11 && categories.Categories.Sum(c => c.Count) == 11, "Overall counts include archived students and separate rejected applicants once each.");
        Check(categories.Categories.Single(c => c.Reason == "Rejected Slots").Count == 3, "Rejected applications and declined offers count; expired offers, current students, and duplicate applicants do not.");
        Check(categories.Categories.Single(c => c.Reason == "Others").Count == 3, "Other, unknown, and blank archive reasons belong to Others.");
        Check(categories.Categories.Single(c => c.Reason == "Graduated").Count == 1 && categories.Categories.Single(c => c.Reason == "Withdrawal").Count == 1, "Latest archive reason replaces earlier reasons without double counting.");
        var savedRejected = ArchiveCategoryStatistics.Build(categoryRows.Append(new(10, 26, 108, 1, 1, "Rejected Slots", day)), slotRows,
            null, "All Batches", null, "All Courses");
        Check(savedRejected.Categories.Single(c => c.Reason == "Rejected Slots").Count == 4 && savedRejected.TotalAccounts == 12,
            "Saved student Rejected Slots reasons add to separately stored rejected applications.");
        var courseOnly = ArchiveCategoryStatistics.Build(categoryRows, slotRows, null, "All Batches", 1, "CSS");
        Check(courseOnly.TotalAccounts == 7 && courseOnly.Categories.Single(c => c.Reason == "Rejected Slots").Count == 2, "Course-only filter includes matching records across batches.");
        var batchOnly = ArchiveCategoryStatistics.Build(categoryRows, slotRows, 5, "Batch 5", null, "All Courses");
        Check(batchOnly.TotalAccounts == 6 && batchOnly.Categories.Single(c => c.Reason == "Rejected Slots").Count == 2, "Batch-only filter includes matching records across courses.");
        var combined = ArchiveCategoryStatistics.Build(categoryRows, slotRows, 5, "Batch 5", 1, "CSS");
        Check(combined.TotalAccounts == 3 && combined.Categories.Single(c => c.Reason == "Rejected Slots").Count == 1, "Combined filters apply their intersection to both archives and rejected slots.");
        var emptyCategories = ArchiveCategoryStatistics.Build(categoryRows, slotRows, 99, "Empty", 99, "Empty");
        Check(emptyCategories.TotalAccounts == 0 && emptyCategories.Categories.Count == 7 && emptyCategories.Categories.All(c => c.Count == 0), "Empty selections retain seven explicit zero counts.");
        var categoryJson = System.Text.Json.JsonSerializer.Serialize(categories);
        Check(!categoryJson.Contains("StudentId") && !categoryJson.Contains("ApplicantId"), "Category endpoint exposes counts without student or applicant details.");
        await using var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>().Options);
        foreach (var action in new[] { "Statistics", "Categories", "DownloadReport" }) foreach (var spoof in new[] { false, true })
        {
            var controller = action == "DownloadReport" ? "BatchApi" : "Archive";
            var http = new DefaultHttpContext();
            if (spoof) http.Request.Headers["X-Abec-Admin-Id"] = "1";
            var route = new RouteData(); route.Values["controller"] = controller; route.Values["action"] = action;
            var context = new AuthorizationFilterContext(new ActionContext(http, route, new ActionDescriptor()), new List<IFilterMetadata>());
            await new BatchAccessFilter(db).OnAuthorizationAsync(context);
            Check(context.Result is UnauthorizedObjectResult, "Anonymous/header-spoofed reports must be denied before any query.");
        }
        foreach (var invalid in new[] { 0, -1 })
        {
            Check(await new ArchiveController(null!).Statistics(invalid, null!, CancellationToken.None) is BadRequestObjectResult, "Invalid batch IDs must not become an overall report.");
            Check(await new ArchiveController(null!).Categories(invalid, null, null!, CancellationToken.None) is BadRequestObjectResult, "Invalid category batch IDs cannot broaden the selection.");
            Check(await new ArchiveController(null!).Categories(null, invalid, null!, CancellationToken.None) is BadRequestObjectResult, "Invalid category course IDs cannot broaden the selection.");
        }
        Console.WriteLine($"PASS: {count} archive statistics and authorization checks; no database opened.");
    }
}
