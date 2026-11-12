using ABEC_System.Data;
using ABEC_System.DTOs;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Services;

// An optional selected-batch context must match the record, for reads and before write side effects.
// Identity/role authorization remains in BatchAccessFilter; record IDs never change ownership.
public sealed class BatchContextFilter(ApplicationDbContext db) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        if (!context.HttpContext.Request.Query.TryGetValue("batchId", out var supplied)) { await next(); return; }
        if (supplied.Count != 1 || !int.TryParse(supplied[0], out var expected) || expected <= 0)
            throw new BatchIntegrityException("Select a valid batch.", "batchId");
        var ct = context.HttpContext.RequestAborted;
        int Id(string argumentName) => context.ActionArguments.TryGetValue(argumentName, out var v) && v is int id ? id : 0;
        var ids = context.ActionArguments.Values.OfType<BulkStatusDto>().FirstOrDefault()?.Ids.ToList() ?? [];
        if (Id("id") > 0) ids.Add(Id("id"));
        var studentId = Id("studentId");
        List<int?> batches = [];
        switch (context.RouteData.Values["controller"]?.ToString())
        {
            case "Applicant":
                batches = await db.Applicants.Where(a => ids.Contains(a.ApplicantId)).Select(a => a.BatchId).ToListAsync(ct);
                if (context.ActionArguments.Values.OfType<ConfirmSlotDto>().FirstOrDefault() is { } slot)
                    batches.AddRange(await db.Applicants.Where(a => a.ConfirmationToken == slot.Token).Select(a => a.BatchId).ToListAsync(ct));
                if (context.RouteData.Values["action"]?.ToString() is "Enroll" or "EnrollWithFiles")
                    batches.Add(await db.ResolveReadBatchIdAsync(null, ct));
                break;
            case "Activation":
                batches = await db.Students.Where(s => ids.Contains(s.StudentId)).Select(s => (int?)s.BatchId).ToListAsync(ct);
                break;
            case "StudentApi":
                batches = await db.Students.Where(s => s.StudentId == studentId).Select(s => (int?)s.BatchId).ToListAsync(ct);
                break;
            case "Archive":
                studentId = studentId > 0 ? studentId : context.ActionArguments.Values.OfType<CreateArchiveDto>().FirstOrDefault()?.StudentId ?? 0;
                batches = await db.Students.Where(s => s.StudentId == studentId).Select(s => (int?)s.BatchId).ToListAsync(ct);
                break;
            case "DocumentRequest":
                batches = await db.DocumentRequests.Where(r => ids.Contains(r.RequestId)).Select(r => (int?)r.Student!.BatchId).ToListAsync(ct);
                if (studentId > 0) batches.AddRange(await db.Students.Where(s => s.StudentId == studentId).Select(s => (int?)s.BatchId).ToListAsync(ct));
                break;
            case "CourseDocument":
                batches = await db.StudentCourseDocuments.Where(d => ids.Contains(d.CourseDocumentId)).Select(d => (int?)d.Student!.BatchId).ToListAsync(ct);
                if (studentId > 0) batches.AddRange(await db.Students.Where(s => s.StudentId == studentId).Select(s => (int?)s.BatchId).ToListAsync(ct));
                if (Id("batchId") > 0) batches.Add(Id("batchId"));
                break;
            case "Schedule":
                batches = await db.CourseSchedules.Where(s => ids.Contains(s.ScheduleId)).Select(s => (int?)s.BatchId).ToListAsync(ct);
                if (ids.Count == 0 && context.ActionArguments.Values.OfType<CreateScheduleDto>().FirstOrDefault() is { } schedule) batches.Add(schedule.BatchId);
                break;
            case "BatchApi":
                batches.AddRange(ids.Select(id => (int?)id));
                break;
            case "Notification":
                batches = await db.Notifications.Where(n => ids.Contains(n.NotificationId)).Select(n => n.BatchId ?? (int?)n.Student!.BatchId).ToListAsync(ct);
                break;
        }
        if (batches.Any(batch => batch != expected))
            throw new BatchIntegrityException("This record does not belong to the selected batch. Refresh the batch view before continuing.", "batchId");
        await next();
    }
}
