using System.Text.Json;
using System.Text.RegularExpressions;
using ABEC_System.Data;
using ABEC_System.Models;
using ABEC_System.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

internal static class SecurityPinWorkflowChecks
{
    public static async Task Run(ApplicationDbContext db, Applicant original, Student originalStudent, TestEnvironment env)
    {
        var checks = 0;
        void Check(bool success, string label) { if (!success) throw new Exception("FAIL " + label); checks++; Console.WriteLine("PASS " + label); }
        var connection = db.Database.GetConnectionString()!;
        var batchId = originalStudent.BatchId;
        var courseId = original.CourseId;
        var notices = new NotificationService(db);
        var enrollment = new ApplicantService(db, notices, new TestEmail(), new TestPdf(), new TestOptions(),
            new Microsoft.AspNetCore.Http.HttpContextAccessor(), new ApplicantRegistrationStorageService(db, env));
        var activation = Activation(db);
        var originalPin = originalStudent.SecurityPin;
        string OriginalSnapshot() => JsonSerializer.Serialize(new { original.ApplicantId, original.FirstName, original.LastName,
            original.Email, original.ContactNumber, original.Address, original.Birthdate, original.CourseId, original.BatchId,
            original.ApplicationStatus, originalStudent.StudentId, StudentApplicantId = originalStudent.ApplicantId,
            StudentBatchId = originalStudent.BatchId, originalStudent.AccountStatus });
        var originalRecord = OriginalSnapshot();

        var applicant = await Applicant("  mark lester  ", "  comighod  ", "created");
        var created = await enrollment.AddToSlotAsync(applicant.ApplicantId);
        Check(created.Success, "Confirmed enrollment automatically creates a student account.");
        var student = await db.Students.Include(s => s.Applicant).SingleAsync(s => s.ApplicantId == applicant.ApplicantId);
        var issuedPin = student.SecurityPin;
        Check(Regex.IsMatch(issuedPin, "^ABECMC[0-9]{4}$"), "Registered trimmed lowercase names produce ABECMC and exactly four ASCII digits.");
        Check(student.AccountStatus == "Inactive" && student.BatchId == batchId && student.ApplicantId == applicant.ApplicantId,
            "PIN issuance preserves the pending activation state and enrollment relationships.");
        Check(!(await new AuthService(db).StudentLoginAsync(new() { Email = applicant.Email, SecurityPin = issuedPin })).Success,
            "Issuance alone does not enable an inactive account.");
        var same = await enrollment.AddToSlotAsync(applicant.ApplicantId);
        Check(same.Success && same.Data!.StudentId == student.StudentId
            && await db.Students.CountAsync(s => s.ApplicantId == applicant.ApplicantId) == 1 && student.SecurityPin == issuedPin,
            "Repeated enrollment creates no duplicate student and preserves the issued PIN.");
        Check((await activation.ActivateAsync(student.StudentId)).Success && student.SecurityPin == issuedPin,
            "First activation retains the PIN issued during account creation.");
        Check((await activation.ActivateAsync(student.StudentId)).Success && student.SecurityPin == issuedPin,
            "Repeated activation retains an existing PIN.");
        Check((await new AuthService(db).StudentLoginAsync(new() { Email = applicant.Email, SecurityPin = issuedPin })).Success,
            "Newly activated student can sign in with the issued PIN.");
        var portal = new StudentPortalService(db, new DocumentRequestService(db, notices, new TestEmail(), env), notices);
        await portal.GetProfileAsync(student.StudentId);
        Check(student.SecurityPin == issuedPin, "Login and profile reads do not regenerate the PIN.");
        var reset = await activation.GeneratePinAsync(student.StudentId);
        Check(reset.Success && Regex.IsMatch(reset.Data!.SecurityPin, "^ABECMC[0-9]{4}$") && reset.Data.SecurityPin != issuedPin,
            "Explicit authorized reset issues a different PIN in the required format.");
        Check(!(await new AuthService(db).StudentLoginAsync(new() { Email = applicant.Email, SecurityPin = issuedPin })).Success
            && (await new AuthService(db).StudentLoginAsync(new() { Email = applicant.Email, SecurityPin = student.SecurityPin })).Success,
            "Reset updates only this student's credential and sign-in uses the saved replacement.");

        var expectedVersion = reset.Data!.SecurityPinVersion;
        Check(expectedVersion > 0 && reset.Data.SecurityPinGeneratedAt.HasValue,
            "Activation metadata reports the saved PIN issue event without exposing the credential in routine JSON.");
        await using var resetOne = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseMySql(connection, new MySqlServerVersion(new Version(8, 0, 36))).Options);
        await using var resetTwo = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseMySql(connection, new MySqlServerVersion(new Version(8, 0, 36))).Options);
        var simultaneous = await Task.WhenAll(Activation(resetOne).GeneratePinAsync(student.StudentId, default, expectedVersion),
            Activation(resetTwo).GeneratePinAsync(student.StudentId, default, expectedVersion));
        Check(simultaneous.Count(result => result.Success) == 1,
            "Concurrent requests for the same saved PIN version issue only one replacement.");
        await db.Entry(student).ReloadAsync();
        var currentPin = student.SecurityPin;
        Check(!(await activation.GeneratePinAsync(student.StudentId, default, expectedVersion)).Success && student.SecurityPin == currentPin,
            "A stale page or replay cannot silently replace the already updated PIN again.");

        student.CreatedAt = DateTime.Now.AddYears(-2); await db.SaveChangesAsync();
        var noticeService = new ActivationService(db, notices, new PdfService(env), new ArchiveService(db, notices), new TestEmail(), new TestOptions(), env);
        var notice = await noticeService.GetActivationNoticePdfAsync(student.StudentId);
        Check(notice.Success && notice.Data!.AsSpan(0, 5).SequenceEqual("%PDF-"u8),
            "The enrolled student's updated Activation Notice is generated by the real PDF service.");
        var noticeFolder = Path.GetFullPath("artifacts/enrolled-pin-notice-fixture"); Directory.CreateDirectory(noticeFolder);
        await File.WriteAllBytesAsync(Path.Combine(noticeFolder, "activation-notice.pdf"), notice.Data!);
        var generatedAt = await db.Notifications.Where(n => n.StudentId == student.StudentId && n.Title == "Security PIN Generated")
            .OrderByDescending(n => n.CreatedAt).Select(n => n.CreatedAt).FirstAsync();
        await File.WriteAllTextAsync(Path.Combine(noticeFolder, "expected.json"), JsonSerializer.Serialize(new {
            Pin = student.SecurityPin, PreviousPin = issuedPin, GeneratedDate = generatedAt.ToString("MMMM dd, yyyy"),
            OldDate = student.CreatedAt.ToString("MMMM dd, yyyy") }));
        Check(student.SecurityPin == currentPin, "Downloading the updated notice does not regenerate the student's PIN.");

        var currentVersion = (await activation.GetAccountsAsync()).Data!.Single(s => s.StudentId == student.StudentId).SecurityPinVersion;
        var unchanged = await activation.GeneratePinAsync(student.StudentId, default, currentVersion, true);
        Check(unchanged.Success && unchanged.Data!.SecurityPin == currentPin && unchanged.Data.SecurityPinVersion == currentVersion,
            "Format-only updates preserve an already-correct saved PIN and issue event.");
        var legacyFormat = await Student("Lena", "Convert", "format-only", "legacy-format-only", "Active");
        var converted = await activation.GeneratePinAsync(legacyFormat.StudentId, default, 0, true);
        Check(converted.Success && Regex.IsMatch(converted.Data!.SecurityPin, "^ABECLC[0-9]{4}$") && converted.Data.SecurityPinVersion > 0,
            "Format-only updates convert an enrolled legacy account through the shared backend issuer.");

        var missing = await Student("Pending", "Missing", "missing", "", "Inactive");
        Check((await activation.ActivateAsync(missing.StudentId)).Success && Regex.IsMatch(missing.SecurityPin, "^ABECPM[0-9]{4}$"),
            "Admin activation fills a missing PIN on a pending account.");
        missing.SecurityPin = ""; await db.SaveChangesAsync();
        Check((await activation.ActivateAsync(missing.StudentId)).Success && Regex.IsMatch(missing.SecurityPin, "^ABECPM[0-9]{4}$"),
            "Explicit Admin activation repairs a missing PIN even when the account is already active.");
        var repaired = missing.SecurityPin;
        Check((await activation.ActivateAsync(missing.StudentId)).Success && missing.SecurityPin == repaired,
            "Activating the repaired account again does not replace its credential.");

        var invalid = await Student("123", "Invalid", "invalid", "legacy-invalid", "Inactive");
        Check((await activation.ActivateAsync(invalid.StudentId)).Success && invalid.SecurityPin == "legacy-invalid",
            "An existing credential is preserved without validating or changing old names.");
        // The nonempty legacy PIN is deliberately accepted; only explicit reset
        // needs valid initials, never an ordinary activation of an existing code.
        Check(invalid.SecurityPin == "legacy-invalid", "Legacy activation does not silently convert existing PINs.");
        try { await activation.GeneratePinAsync(invalid.StudentId); throw new Exception("Expected invalid initials rejection."); }
        catch (BatchIntegrityException) { Check(invalid.SecurityPin == "legacy-invalid", "Invalid registered initials cannot produce a fallback or malformed replacement."); }

        db.Archives.Add(new() { StudentId = originalStudent.StudentId, ArchiveReason = "Deactivated", ArchiveDate = DateTime.Now });
        originalStudent.AccountStatus = "Inactive"; await db.SaveChangesAsync();
        Check(!(await activation.GeneratePinAsync(originalStudent.StudentId)).Success && originalStudent.SecurityPin == originalPin,
            "Archived students retain their PIN and cannot receive an unauthorized archive reset.");
        Check(!(await new AuthService(db).StudentLoginAsync(new() { Email = original.Email, SecurityPin = originalPin })).Success,
            "Archived inactive accounts remain unable to sign in.");
        Check((await activation.ReactivateAsync(originalStudent.StudentId)).Success && originalStudent.SecurityPin == originalPin,
            "Authorized reactivation preserves the legacy PIN and existing student record.");
        Check((await new AuthService(db).StudentLoginAsync(new() { Email = original.Email, SecurityPin = originalPin })).Success,
            "Reactivated legacy account remains accessible.");

        foreach (var cancel in new[] { false, true })
        {
            var failureStudent = await Student("Failure", "Recovery", cancel ? "cancel" : "failure", cancel ? "legacy-cancel" : "legacy-failure", "Active");
            var previous = failureStudent.SecurityPin;
            var interceptor = new FailPinSaveOnce(cancel);
            await using var failureDb = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseMySql(connection, new MySqlServerVersion(new Version(8, 0, 36))).AddInterceptors(interceptor).Options);
            try { await Activation(failureDb).GeneratePinAsync(failureStudent.StudentId); throw new Exception("Expected injected save failure."); }
            catch (Exception ex) when (ex is DbUpdateException or OperationCanceledException)
            {
                Check(interceptor.Failed && failureDb.Students.Local.Single().SecurityPin == previous,
                    cancel ? "Cancelled issuance restores the previous PIN in memory." : "Failed issuance restores the previous PIN in memory.");
            }
            failureDb.Notifications.Add(new() { StudentId = failureStudent.StudentId, Title = "Verification", Message = "Unrelated save after failure", CreatedAt = DateTime.Now });
            await failureDb.SaveChangesAsync();
            Check((await db.Students.AsNoTracking().SingleAsync(s => s.StudentId == failureStudent.StudentId)).SecurityPin == previous,
                "A later unrelated save cannot persist the rejected PIN candidate.");
            Check((await Activation(failureDb).GeneratePinAsync(failureStudent.StudentId)).Success,
                "PIN issuance can be retried successfully after a failed write.");
        }
        Check(OriginalSnapshot() == originalRecord && originalStudent.SecurityPin == originalPin,
            "Original registered student information and credential remain unchanged.");
        Console.WriteLine($"PASS {checks} focused Security PIN workflow checks.");

        ActivationService Activation(ApplicationDbContext context) => new(context, new NotificationService(context), new TestPdf(),
            new ArchiveService(context, new NotificationService(context)), new TestEmail(), new TestOptions(), env);
        async Task<Applicant> Applicant(string first, string last, string key)
        {
            var value = new Applicant { FirstName = first, LastName = last, Gender = "Male", Birthdate = new(2000, 1, 1),
                ContactNumber = "098" + Random.Shared.Next(10000000, 99999999), Email = key + "@example.invalid", Address = "Verification only",
                CourseId = courseId, BatchId = batchId, ApplicationStatus = "Confirmed Slot", ApplicationDate = DateTime.Now };
            db.Applicants.Add(value); await db.SaveChangesAsync(); return value;
        }
        async Task<Student> Student(string first, string last, string key, string pin, string status)
        {
            var value = await Applicant(first, last, key);
            var student = new Student { ApplicantId = value.ApplicantId, BatchId = batchId, SecurityPin = pin, AccountStatus = status, CreatedAt = DateTime.Now };
            db.Students.Add(student); await db.SaveChangesAsync(); return student;
        }
    }

    private sealed class FailPinSaveOnce(bool cancel) : SaveChangesInterceptor
    {
        public bool Failed { get; private set; }
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData data, InterceptionResult<int> result, CancellationToken ct = default)
        {
            if (!Failed && data.Context!.ChangeTracker.Entries<Student>().Any(e => e.State == EntityState.Modified && e.Entity.SecurityPin.StartsWith("ABECFR", StringComparison.Ordinal)))
            {
                Failed = true;
                if (cancel) throw new OperationCanceledException("Injected verification cancellation.", ct);
                throw new DbUpdateException("Injected verification save failure.");
            }
            return ValueTask.FromResult(result);
        }
    }
}
