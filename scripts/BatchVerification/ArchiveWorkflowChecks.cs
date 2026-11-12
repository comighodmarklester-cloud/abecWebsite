using ABEC_System.Constants;
using ABEC_System.Controllers;
using ABEC_System.Data;
using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using ABEC_System.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

internal static class ArchiveWorkflowChecks
{
    public static async Task Run(ApplicationDbContext db, int studentId, int courseId, int batchId)
    {
        var checks = 0;
        void Check(bool value, string message) { if (!value) throw new Exception(message); checks++; }
        var service = new ArchiveService(db, new NotificationService(db));
        async Task<ArchiveCategoryStatistics> Graph(int? course = null, int? batch = null)
            => (ArchiveCategoryStatistics)((ApiResponse<ArchiveCategoryStatistics>)((OkObjectResult)
                await new ArchiveController(service).Categories(batch, course, db, default)).Value!).Data!;
        Check((await Graph()).TotalAccounts == 0, "Fixture starts with zero accounts on the graph.");
        foreach (var reason in new[] { "", "Invalid", "Others", "Other" })
        {
            var result = await service.CreateAsync(new() { StudentId = studentId, ArchiveReason = reason });
            Check(!result.Success && (await Graph()).TotalAccounts == 0, "Invalid or incomplete archive does not affect graph counts.");
        }
        var tooLong = await service.CreateAsync(new() { StudentId = studentId, ArchiveReason = "Others", SpecificReason = new string('x', 501) });
        Check(!tooLong.Success && (await Graph()).TotalAccounts == 0, "Oversized reason detail cannot change graph counts.");
        try
        {
            await new ArchiveService(db, new FailingArchiveNotifications()).CreateAsync(new() { StudentId = studentId, ArchiveReason = "Graduated" });
            throw new Exception("Expected a notification failure.");
        }
        catch (InvalidOperationException e) when (e.Message == "Simulated archive notification failure") {}
        db.ChangeTracker.Clear();
        Check(!await db.Archives.AnyAsync(a => a.StudentId == studentId)
            && (await db.Students.AsNoTracking().SingleAsync(s => s.StudentId == studentId)).AccountStatus == "Active"
            && (await Graph()).TotalAccounts == 0, "A failure after saving rolls back the archive and account status together.");
        foreach (var reason in ArchiveCategoryStatistics.CategoryNames)
        {
            var result = await service.CreateAsync(new() { StudentId = studentId, ArchiveReason = reason,
                SpecificReason = reason == "Others" ? "Specific workflow reason" : "Discard this stale detail" });
            Check(result.Success, "Each graph category can be saved as a student archive reason: " + reason);
            var stored = await db.Archives.AsNoTracking().SingleAsync(a => a.StudentId == studentId);
            Check(stored.ArchiveReason == SystemConstants.ArchiveReasons.Normalize(reason)
                && stored.SpecificReason == (reason == "Others" ? "Specific workflow reason" : null), "Saved archive retains the selected reason and only applicable detail.");
            var graph = await Graph(courseId, batchId);
            Check(graph.TotalAccounts == 1 && graph.Categories.Single(c => c.Reason == reason).Count == 1
                && graph.Categories.Where(c => c.Reason != reason).All(c => c.Count == 0), "Graph counts the saved student once under the correct reason, course, and batch.");
            Check((await Graph(courseId)).TotalAccounts == 1 && (await Graph(batch: batchId)).TotalAccounts == 1,
                "Both filters work independently after saving an archive.");
            var students = await new CourseService(db, null!).GetEnrolledStudentsAsync(courseId, batchId: batchId);
            Check(students.Data!.Single(s => s.StudentId == studentId).IsArchived, "Course list reflects the saved archive state.");
        }
        Check(await db.Archives.CountAsync(a => a.StudentId == studentId) == 1, "Changing the reason never creates a duplicate student count.");
        Console.WriteLine($"PASS: {checks} archive save, failure rollback, and filtered graph checks in the isolated database.");
    }

    private sealed class FailingArchiveNotifications : INotificationService
    {
        public Task CreateAsync(string title, string message, int? studentId = null, int? applicantId = null, CancellationToken cancellationToken = default)
            => throw new InvalidOperationException("Simulated archive notification failure");
        public Task<ApiResponse<IReadOnlyList<NotificationDto>>> GetForStudentAsync(int studentId, string? status = null, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<ApiResponse<IReadOnlyList<NotificationDto>>> GetAdminNotificationsAsync(int? adminId = null, string? status = null, CancellationToken cancellationToken = default, int? batchId = null) => throw new NotSupportedException();
        public Task<ApiResponse<object>> MarkReadAsync(int notificationId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<ApiResponse<object>> MarkAllReadAsync(int studentId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task CreateAdminAsync(string title, string message, int? applicantId = null, CancellationToken cancellationToken = default, int? requestId = null, int? courseDocumentId = null) => throw new NotSupportedException();
    }
}
