using System.Security.Claims;
using ABEC_System.Data;
using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using ABEC_System.Models;
using ABEC_System.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

internal static class StrictSecurityChecks
{
    public static async Task Run(ApplicationDbContext db, Applicant applicant, Student student, Admin admin, TestEnvironment environment)
    {
        var checks = 0;
        void Check(bool value, string label) { if (!value) throw new Exception(label); checks++; }
        ClaimsPrincipal Identity(string role, int id) => new(new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, id.ToString()), new Claim(ClaimTypes.Role, role) }, "StudentSession"));
        async Task<IActionResult?> Access(string controller, string action, ClaimsPrincipal user, string key = "id", int value = 1)
        {
            var http = new DefaultHttpContext { User = user }; http.Request.Headers["X-Abec-Admin-Id"] = admin.AdminId.ToString();
            var route = new RouteData(); route.Values["controller"] = controller; route.Values["action"] = action; route.Values[key] = value;
            var context = new AuthorizationFilterContext(new ActionContext(http, route, new ActionDescriptor()), new List<IFilterMetadata>());
            await new BatchAccessFilter(db).OnAuthorizationAsync(context); return context.Result;
        }
        foreach (var action in new[] { "GetAll", "Create" })
        {
            Check(await Access("TrainingRoom", action, new()) is UnauthorizedObjectResult, "Anonymous training-room access must be denied despite a forged admin header.");
            Check(await Access("TrainingRoom", action, Identity("Student", student.StudentId)) is ObjectResult { StatusCode: 403 }, "Students must not administer training rooms.");
            Check(await Access("TrainingRoom", action, Identity("Admin", admin.AdminId)) is null, "Admin training-room workflows must remain usable.");
        }
        Check(await Access("NewUnlistedApi", "Create", new()) is UnauthorizedObjectResult, "An unlisted controller must fail closed.");
        Check(await Access("AdminProfile", "GetProfile", Identity("Admin", admin.AdminId), "adminId", admin.AdminId + 1000) is ObjectResult { StatusCode: 403 }, "An admin must not access another admin's personal settings.");
        Check(await Access("AdminProfile", "UpdateProfile", Identity("Admin", admin.AdminId), "adminId", admin.AdminId) is null, "An admin must retain access to their own profile.");

        var auth = new AuthService(db);
        var originalPin = student.SecurityPin;
        var supplied = Guid.NewGuid().ToString("N");
        var registration = new StudentRegisterDto { FirstName = applicant.FirstName, Surname = applicant.LastName, Email = applicant.Email, SecurityPin = originalPin, Password = supplied, ConfirmPassword = supplied };
        student.AccountStatus = "Inactive"; await db.SaveChangesAsync();
        Check(!(await auth.RegisterStudentAsync(registration)).Success, "Legacy registration must not reactivate a disabled student.");
        Check(student.AccountStatus == "Inactive", "Rejected registration must not change account state.");
        student.AccountStatus = "Active"; await db.SaveChangesAsync();
        Check((await auth.RegisterStudentAsync(registration)).Success && student.SecurityPin == originalPin, "Existing active users retain legacy PIN sign-in.");
        Check(!(await auth.StudentLoginAsync(new() { SecurityPin = originalPin })).Success, "PIN login requires the registered email address.");
        Check(!(await auth.StudentLoginAsync(new() { Email = "different@example.invalid", SecurityPin = originalPin })).Success, "A valid PIN must not authenticate a different email address.");
        Check((await auth.StudentLoginAsync(new() { Email = applicant.Email, SecurityPin = originalPin })).Success, "Issued legacy PIN remains usable with its registered email.");
        var preservedPin = student.SecurityPin;
        student.SecurityPin = "0000123456789012"; await db.SaveChangesAsync();
        Check((await auth.StudentLoginAsync(new() { Email = applicant.Email, SecurityPin = student.SecurityPin })).Success, "Numeric PIN authentication preserves leading zeroes.");
        student.SecurityPin = preservedPin; await db.SaveChangesAsync();
        var activation = new ActivationService(db, new NotificationService(db), new TestPdf(), new ArchiveService(db, new NotificationService(db)), new TestEmail(), new TestOptions(), environment);
        var courseQueries = new CourseService(db, new CourseHistoryRecorder(db, new HttpContextAccessor()));
        var namedStudent = (await courseQueries.GetEnrolledStudentsAsync(applicant.CourseId, applicant.FirstName + " " + applicant.LastName, batchId: student.BatchId)).Data!;
        Check(namedStudent.Any(s => s.StudentId == student.StudentId), "Course enrollment search supports a combined first and last name.");
        Check(namedStudent.All(s => string.IsNullOrEmpty(s.SecurityPin)), "General course lists must not disclose login PINs.");
        Check((await activation.GetAccountsAsync(search: applicant.FirstName + " " + applicant.LastName, batchId: student.BatchId)).Data!.Any(s => s.StudentId == student.StudentId), "Activation search supports a student's combined name.");

        var credentials = Enumerable.Range(0, 5).Select(_ => (IFormFile)new FormFile(new MemoryStream("%PDF-1.4\n<svg onload=alert(1)>"u8.ToArray()), 0, "%PDF-1.4\n<svg onload=alert(1)>"u8.Length, "credentialFiles", "upload.pdf")
            { Headers = new HeaderDictionary(), ContentType = "text/html" }).ToList();
        var identity = new FormFile(new MemoryStream("%PDF-1.4\n"u8.ToArray()), 0, "%PDF-1.4\n"u8.Length, "identityFile", "identity.pdf") { Headers = new HeaderDictionary(), ContentType = "text/html" };
        var storage = new ApplicantRegistrationStorageService(db, environment);
        var labels = new[] { "TOR", "Form138", "HonorableDismissal", "GoodMoral", "BirthCertificate" };
        Check((await storage.SaveEnrollmentDocumentsAsync(applicant.ApplicantId, credentials, identity, labels)).Success, "Valid PDF bytes should be accepted independently of untrusted MIME metadata.");
        var record = await db.ApplicantRegistrationDocuments.FirstAsync(d => d.ApplicantId == applicant.ApplicantId);
        Check(record.ContentType == "application/pdf", "Upload metadata must store the canonical server-derived MIME type.");
        record.ContentType = "text/html"; await db.SaveChangesAsync();
        var opened = await storage.OpenDocumentAsync(applicant.ApplicantId, record.DocumentId);
        Check(opened.ContentType == "application/pdf" && opened.Stream is not null, "Legacy spoofed MIME metadata must not produce an HTML preview.");
        if (opened.Stream is not null) await opened.Stream.DisposeAsync();
        var outside = Path.Combine(environment.ContentRootPath, "outside.pdf"); Directory.CreateDirectory(environment.ContentRootPath); await File.WriteAllTextAsync(outside, "%PDF-1.4\n");
        record.StoredRelativePath = outside; await db.SaveChangesAsync();
        Check((await storage.OpenDocumentAsync(applicant.ApplicantId, record.DocumentId)).Stream is null, "Corrupted upload metadata must not escape private storage.");

        var issued = new HashSet<string>();
        for (var count = 0; count < 3; count++)
        {
            var generated = await activation.GeneratePinAsync(student.StudentId);
            var pin = generated.Data?.SecurityPin ?? "";
            var prefix = "ABEC" + char.ToUpperInvariant(applicant.FirstName.Trim()[0]) + char.ToUpperInvariant(applicant.LastName.Trim()[0]);
            Check(generated.Success && pin.StartsWith(prefix, StringComparison.Ordinal) && System.Text.RegularExpressions.Regex.IsMatch(pin, @"^ABEC\p{Lu}{2}[0-9]{4}$") && issued.Add(pin), "Authorized PIN regeneration uses registered initials and four fresh random digits.");
        }
        var tooLong = await new AdminProfileService(db, new NotificationService(db)).ChangePasswordAsync(admin.AdminId,
            new() { CurrentPassword = VerificationAccounts.Password, NewPassword = new string('x', 73) });
        Check(!tooLong.Success, "Admin password changes must reject BCrypt truncation.");
        Console.WriteLine($"PASS {checks} isolated authorization, account-state, hostile upload and PIN security checks.");
    }
}
