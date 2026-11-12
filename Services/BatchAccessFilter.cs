using System.Security.Claims;
using ABEC_System.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Services;

// Protect the batch/document workflows using server-issued identity, never client headers.
public sealed class BatchAccessFilter(ApplicationDbContext db) : IAsyncAuthorizationFilter
{
    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var controller = context.RouteData.Values["controller"]?.ToString() ?? "";
        var action = context.RouteData.Values["action"]?.ToString() ?? "";
        if (controller == "BatchApi" && action == "GetActive") return;
        if (controller == "Applicant" && action is "Enroll" or "EnrollWithFiles" or "ConfirmSlot" or "DeclineSlot") return;
        if (controller == "Course" && action is "GetAll" or "GetById") return;
        if (controller == "Location" && action is "Provinces" or "Cities" or "Barangays") return;
        if (controller == "Auth" && action is "AdminLogin" or "StudentLogin" or "Register" or "StudentLogout") return;
        if (controller is "Home" or "Student") return; // Public HTML shells contain no account data.
        // New controllers are protected by default; missing a name must never grant access.
        var user = context.HttpContext.User;
        var ct = context.HttpContext.RequestAborted;
        if (user.Identity?.IsAuthenticated != true || !int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id))
        { context.Result = new UnauthorizedObjectResult(new { success = false, message = "Sign in to continue." }); return; }
        if (user.IsInRole("Admin") && await db.Admins.AnyAsync(a => a.AdminId == id, ct))
        {
            if (controller == "AdminProfile" && context.RouteData.Values.TryGetValue("adminId", out var supplied)
                && (!int.TryParse(supplied?.ToString(), out var ownerId) || ownerId != id)) Deny();
            return;
        }
        if (!user.IsInRole("Student") || !await db.Students.AnyAsync(s => s.StudentId == id && s.AccountStatus == "Active", ct))
        { Deny(); return; }
        int RouteId(string routeName) => int.TryParse(context.RouteData.Values.GetValueOrDefault(routeName)?.ToString(), out var value) ? value : 0;
        var recordId = RouteId("id");
        var owner = 0;
        if (controller == "StudentApi") owner = RouteId("studentId");
        if (controller == "StudentAccount") owner = id;
        if (controller == "DocumentRequest")
        {
            if (action is "GetByStudent" or "GetStudentCatalog" or "Create") owner = RouteId("studentId");
            if (action is "GetById" or "DownloadFile")
                owner = await db.DocumentRequests.Where(r => r.RequestId == recordId && (action != "DownloadFile" || r.RequestStatus == "Released"))
                    .Select(r => r.StudentId).SingleOrDefaultAsync(ct);
        }
        if (controller == "CourseDocument")
        {
            if (action == "GetStudent") owner = RouteId("studentId");
            if (action == "Download") owner = await db.StudentCourseDocuments.Where(d => d.CourseDocumentId == recordId && d.PreparationStatus == "Released").Select(d => d.StudentId).SingleOrDefaultAsync(ct);
        }
        if (controller == "Notification")
        {
            if (action is "GetForStudent" or "MarkAllRead") owner = RouteId("studentId");
            if (action == "MarkRead") owner = await db.Notifications.Where(n => n.NotificationId == recordId).Select(n => n.StudentId ?? 0).SingleOrDefaultAsync(ct);
        }
        if (owner != id) Deny();
        else if (controller == "StudentApi" && action == "Schedule" && !await db.Students.AnyAsync(s => s.StudentId == id && s.Batch!.Status == "Active", ct)) Deny();
        void Deny() => context.Result = new ObjectResult(new { success = false, message = "You do not have access to this batch or document." }) { StatusCode = 403 };
    }
}
