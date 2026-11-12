using System.Security.Claims;
using ABEC_System.Data;
using ABEC_System.DTOs;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Services;

// Runs before any file, mail, or database side effects, including bulk operations.
public sealed class BatchWriteFilter(ApplicationDbContext db) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var request = context.HttpContext.Request;
        if (HttpMethods.IsGet(request.Method) || HttpMethods.IsHead(request.Method)) { await next(); return; }
        var controller = context.RouteData.Values["controller"]?.ToString();
        var previousAdministration = db.DocumentAdministration;
        var previousStudent = db.HistoricalRequestStudentId;
        try
        {
            var admin = context.HttpContext.User.IsInRole("Admin");
            if (admin && controller is "DocumentRequest" or "CourseDocument") db.DocumentAdministration = true;
            var ct = context.HttpContext.RequestAborted;
            int Id(string argumentName) => context.ActionArguments.TryGetValue(argumentName, out var v) && v is int i ? i : 0;
            var ids = context.ActionArguments.Values.OfType<BulkStatusDto>().FirstOrDefault()?.Ids ?? new List<int>();
            if (Id("id") > 0) ids.Add(Id("id"));
            var batches = new List<int?>();
            switch (controller)
            {
                case "Applicant":
                    batches = await db.Applicants.Where(a => ids.Contains(a.ApplicantId)).Select(a => a.BatchId).ToListAsync(ct);
                    var token = context.ActionArguments.Values.OfType<ConfirmSlotDto>().FirstOrDefault()?.Token;
                    if (!string.IsNullOrWhiteSpace(token))
                        batches.AddRange(await db.Applicants.Where(a => a.ConfirmationToken == token).Select(a => a.BatchId).ToListAsync(ct));
                    break;
                case "Activation":
                    batches = await db.Students.Where(s => ids.Contains(s.StudentId)).Select(s => (int?)s.BatchId).ToListAsync(ct);
                    break;
                case "Archive":
                    var studentId = Id("studentId");
                    if (studentId == 0) studentId = context.ActionArguments.Values.OfType<CreateArchiveDto>().FirstOrDefault()?.StudentId ?? 0;
                    batches = await db.Students.Where(s => s.StudentId == studentId).Select(s => (int?)s.BatchId).ToListAsync(ct);
                    break;
                case "StudentApi":
                    batches = await db.Students.Where(s => s.StudentId == IdValue(context, "studentId")).Select(s => (int?)s.BatchId).ToListAsync(ct);
                    break;
                case "DocumentRequest":
                    if (admin) break;
                    if (Id("studentId") > 0)
                    {
                        var sid = Id("studentId");
                        var batch = await db.Students.Where(s => s.StudentId == sid).Select(s => s.Batch).SingleOrDefaultAsync(ct);
                        if (batch?.Status != "Active")
                        {
                            var user = context.HttpContext.User;
                            if (user.Identity?.IsAuthenticated != true || !user.IsInRole("Student") || user.FindFirstValue(ClaimTypes.NameIdentifier) != sid.ToString()
                                || request.Headers.ContainsKey("X-Abec-Admin-Id"))
                                throw new BatchIntegrityException("Completed batches are view-only. Only the authenticated student may submit their own historical document request.");
                            db.HistoricalRequestStudentId = sid;
                        }
                    }
                    else batches = await db.DocumentRequests.Where(r => ids.Contains(r.RequestId)).Select(r => (int?)r.Student!.BatchId).ToListAsync(ct);
                    break;
                case "CourseDocument":
                    if (admin && context.RouteData.Values["action"]?.ToString() != "SetAssessment") break;
                    if (Id("batchId") > 0) batches.Add(Id("batchId"));
                    else batches = await db.StudentCourseDocuments.Where(d => ids.Contains(d.CourseDocumentId)).Select(d => d.BatchId).ToListAsync(ct);
                    break;
            }
            // SMTP runs after approval commits; slot responses save one atomic decision.
            var action = context.RouteData.Values["action"]?.ToString();
            var ownsTransaction = (controller == "Applicant" && action is "UpdateStatus" or "BulkStatus" or "ConfirmSlot" or "DeclineSlot")
                || (controller == "Activation" && action is "Activate" or "Reactivate" or "BulkStatus");
            await using var transaction = !ownsTransaction && batches.Count > 0 && db.Database.CurrentTransaction is null
                ? await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct) : null;
            foreach (var batchId in batches.Distinct()) await db.RequireActiveBatchAsync(batchId, ct);
            var executed = await next();
            if (transaction is not null && executed.Exception is null) await transaction.CommitAsync(ct);
        }
        finally { db.DocumentAdministration = previousAdministration; db.HistoricalRequestStudentId = previousStudent; }
    }

    private static int IdValue(ActionExecutingContext context, string argumentName) =>
        context.ActionArguments.TryGetValue(argumentName, out var value) && value is int id ? id : 0;
}
