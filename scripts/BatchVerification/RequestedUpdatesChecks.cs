using System.Text.Json;
using ABEC_System.Controllers;
using ABEC_System.Data;
using ABEC_System.DTOs;
using ABEC_System.Models;
using ABEC_System.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging;
using MySqlConnector;

internal static class RequestedUpdatesChecks
{
    public static async Task Run(ApplicationDbContext db, Applicant original, Student originalStudent, Admin admin, TestEnvironment env)
    {
        var connection = db.Database.GetConnectionString()!;
        var notices = new NotificationService(db);
        var documents = new DocumentRequestService(db, notices, new TestEmail(), env);
        var portal = new StudentPortalService(db, documents, notices);
        var batch = (await db.Batches.FindAsync(originalStudent.BatchId))!;
        batch.BatchName = "Batch2026-102";
        var course = new Course { CourseName = "Bookkeeping NC II", Duration = "35 days", SlotCapacity = 25, Status = "Available" };
        db.Courses.Add(course); db.TrainingRooms.Add(new() { RoomName = "Verification bookkeeping room" });
        await db.SaveChangesAsync();
        var bookkeeping = await Learner("Beth", "Keeper", "bookkeeping");
        var history = new CourseHistoryRecorder(db, new HttpContextAccessor { HttpContext = new DefaultHttpContext() });
        var schedules = new ScheduleService(db, notices, history);
        var saved = await schedules.CreateAsync(new() { CourseId = course.CourseId, BatchId = batch.BatchId,
            ScheduleDate = DateTime.Today, TrainingDays = "Mon,Wed,Fri", StartTime = TimeSpan.FromHours(8), EndTime = TimeSpan.FromHours(17),
            Trainer = "Bookkeeping verification trainer", Room = "Verification bookkeeping room", Status = "Active" });
        Check(saved.Success, "Bookkeeping Batch2026-102 schedule saves through the admin service.");
        Check((await portal.GetDashboardAsync(bookkeeping.StudentId)).Data!.ClassSchedules.Single().ScheduleId == saved.Data!.ScheduleId,
            "Reported Bookkeeping enrollment receives its actual active batch schedule.");
        Check((await portal.GetScheduleAsync(originalStudent.StudentId)).Data!.Count == 0, "Unrelated enrolled course does not receive Bookkeeping sessions.");
        Check((await schedules.UpdateAsync(saved.Data!.ScheduleId, new() { Trainer = "Updated bookkeeping trainer", TrainingDays = "Tue,Thu" })).Success,
            "Admin can update the reported course schedule.");
        Check((await portal.GetScheduleAsync(bookkeeping.StudentId)).Data!.Single().TrainingDays == "Tue,Thu"
            && (await portal.GetDashboardAsync(bookkeeping.StudentId)).Data!.ClassSchedules.Single().Trainer == "Updated bookkeeping trainer",
            "Both student APIs retrieve the latest Bookkeeping schedule fields.");

        var oldPin = originalStudent.SecurityPin;
        Check((await new AuthService(db).StudentLoginAsync(new() { Email = original.Email, SecurityPin = oldPin })).Success,
            "Existing issued PIN and registered email still authenticate.");
        await portal.GetProfileAsync(originalStudent.StudentId);
        Check((await db.Students.AsNoTracking().SingleAsync(s => s.StudentId == originalStudent.StudentId)).SecurityPin == oldPin,
            "Login and profile reads do not regenerate existing credentials.");
        var activation = Activation(db);
        Check(!JsonSerializer.Serialize((await activation.GetAccountsAsync()).Data).Contains("\"SecurityPin\"", StringComparison.OrdinalIgnoreCase),
            "Routine activation JSON does not expose credentials.");
        Check((await activation.GeneratePinAsync(bookkeeping.StudentId)).Success, "Authorized administrative reissue succeeds.");
        var bookPin = (await db.Students.AsNoTracking().SingleAsync(s => s.StudentId == bookkeeping.StudentId)).SecurityPin;
        Check(System.Text.RegularExpressions.Regex.IsMatch(bookPin, "^ABECBK[0-9]{4}$"), "Reissued credential uses the first registered initials and exactly four random digits.");
        var accented = await Learner("Érica", "Ñora", "accented");
        var accentedPin = (await activation.GeneratePinAsync(accented.StudentId)).Data!.SecurityPin;
        Check(accentedPin.StartsWith("ABECÉÑ", StringComparison.Ordinal)
            && (await new AuthService(db).StudentLoginAsync(new() { Email = "accented@example.invalid", SecurityPin = accentedPin })).Success,
            "Registered accented initials retain their uppercase spelling and can sign in.");

        var catalog = new StudentDocumentCatalog(db);
        Check(!(await documents.CreateAsync(originalStudent.StudentId, new() { DocumentType = "National Certificate (TESDA)" })).Success,
            "Direct requests cannot bypass missing individual training and assessment verification.");
        await catalog.VerifyAsync(originalStudent.StudentId, admin.AdminId, new() { TrainingCompleted = true, AssessmentCompleted = true }, default);
        batch.AssessmentDate = DateTime.Today.AddDays(1); await db.SaveChangesAsync();
        Check(!(await catalog.GetAsync(originalStudent.StudentId, default)).First().CanRequest, "Future assessment date keeps the National Certificate disabled.");
        batch.AssessmentDate = DateTime.Today; await db.SaveChangesAsync();
        Check(!(await catalog.GetAsync(originalStudent.StudentId, default)).First().CanRequest, "The assessment day must finish before requests open.");
        batch.AssessmentDate = DateTime.Today.AddDays(-1); var oldEnd = batch.EndDate; batch.EndDate = DateTime.Today.AddDays(1); await db.SaveChangesAsync();
        Check(!(await catalog.GetAsync(originalStudent.StudentId, default)).First().CanRequest, "Training period must also end.");
        batch.EndDate = oldEnd; await db.SaveChangesAsync();
        Check((await catalog.GetAsync(originalStudent.StudentId, default)).First().CanRequest, "Verified training and assessment with elapsed batch dates enables requesting.");
        var request = await documents.CreateAsync(originalStudent.StudentId, new() { DocumentType = "National Certificate (TESDA)" });
        Check(request.Success && (await documents.GetByStudentAsync(originalStudent.StudentId)).Data!.Any(r => r.RequestId == request.Data!.RequestId),
            "Eligible request is saved and remains accessible in request history.");

        var first = await Learner("Mark", "Comighod", "first");
        var second = await Learner("Mark", "Comighod", "second");
        var exhausted = await Learner("Mark", "Comighod", "exhausted");
        // Reserve 9,998 real indexed credentials in this disposable schema. Only
        // 0000 and 0001 remain, making leading-zero and exhaustion tests deterministic.
        await db.Database.OpenConnectionAsync();
        await db.Database.ExecuteSqlRawAsync("SET SESSION cte_max_recursion_depth=10001");
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO applicants(first_name,last_name,gender,birthdate,age,contact_number,email,address,course_id,batch_id,application_status,application_date)
            WITH RECURSIVE n AS (SELECT 2 AS v UNION ALL SELECT v+1 FROM n WHERE v<9999)
            SELECT 'Mark','Comighod','Male','2000-01-01',26,CONCAT('0990000',LPAD(v,4,'0')),
                CONCAT('pinspace',LPAD(v,4,'0'),'@example.invalid'),'Verification only',{course.CourseId},{batch.BatchId},'Confirmed Slot',NOW() FROM n
            """);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO students(applicant_id,batch_id,security_pin,account_status,created_at)
            SELECT applicant_id,{batch.BatchId},CONCAT('ABECMC',RIGHT(SUBSTRING_INDEX(email,'@',1),4)),'Inactive',NOW()
            FROM applicants WHERE email LIKE 'pinspace%@example.invalid'
            """);
        var archivedId = await db.Students.Where(s => s.SecurityPin == "ABECMC0002").Select(s => s.StudentId).SingleAsync();
        db.Archives.Add(new() { StudentId = archivedId, ArchiveReason = "Deactivated", ArchiveDate = DateTime.Now });
        await db.SaveChangesAsync();
        await using var dbOne = Context(); await using var dbTwo = Context();
        var issued = await Task.WhenAll(Activation(dbOne).GeneratePinAsync(first.StudentId), Activation(dbTwo).GeneratePinAsync(second.StudentId));
        Check(issued.All(r => r.Success) && issued.Select(r => r.Data!.SecurityPin).ToHashSet().SetEquals(new[] { "ABECMC0000", "ABECMC0001" }),
            "Concurrent issuance safely assigns distinct remaining codes, including leading zeros.");
        Check(!(await Activation(db).GeneratePinAsync(archivedId)).Success, "Archived credentials remain assigned and cannot be reissued until reactivation.");
        try { await Activation(db).GeneratePinAsync(exhausted.StudentId); throw new Exception("Expected namespace exhaustion"); }
        catch (BatchIntegrityException) { Check(true, "Exhausted initials namespace returns a controlled error without issuing a duplicate."); }
        Check((await db.Students.AsNoTracking().SingleAsync(s => s.StudentId == exhausted.StudentId)).SecurityPin == "legacy-exhausted",
            "Exhaustion preserves the student's existing credential.");
        try { await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE students SET security_pin={issued[0].Data!.SecurityPin} WHERE student_id={exhausted.StudentId}"); throw new Exception("Expected duplicate rejection"); }
        catch (MySqlException ex) when (ex.Number == 1062) { Check(true, "The database unique index rejects a duplicate credential independently of application checks."); }

        var retryStudent = await Learner("Ria", "Tester", "retry");
        var collisionHolder = await Learner("Other", "Holder", "collision");
        var interceptor = new PinCollision(collisionHolder.StudentId);
        var credentialLogs = new List<string>();
        using var logFactory = LoggerFactory.Create(builder => builder.SetMinimumLevel(LogLevel.Trace)
            .AddFilter((category, level) => CredentialDiagnostics.ShouldLog(category)).AddProvider(new RecordingProvider(credentialLogs)));
        await using var retryDb = Context(interceptor, logFactory);
        await using var collisionTransaction = await retryDb.Database.BeginTransactionAsync();
        var retry = await Activation(retryDb).GeneratePinAsync(retryStudent.StudentId);
        await collisionTransaction.CommitAsync();
        Check(retry.Success && interceptor.Injected && retry.Data!.SecurityPin !=
            (await db.Students.AsNoTracking().SingleAsync(s => s.StudentId == collisionHolder.StudentId)).SecurityPin,
            "A concurrent duplicate-key assignment is retried with a different code.");
        var reservedCollision = (await db.Students.AsNoTracking().SingleAsync(s => s.StudentId == collisionHolder.StudentId)).SecurityPin;
        Check(credentialLogs.All(log => !log.Contains(retry.Data!.SecurityPin) && !log.Contains(reservedCollision))
            && CredentialDiagnostics.ShouldLog("Microsoft.EntityFrameworkCore.Update"),
            "Duplicate-key diagnostics do not log the PIN, and normal diagnostics resume afterward.");

        var archiveCount = await db.Archives.CountAsync();
        batch.Status = "Completed"; batch.CompletedAt = DateTime.Now; await db.SaveChangesAsync();
        var report = (ApiResponse<ArchiveCategoryStatistics>)((OkObjectResult)(await new ArchiveController(null!).Categories(batch.BatchId, course.CourseId, db, default, true))).Value!;
        Check(report.Data!.Categories.Select(c => c.Reason).SequenceEqual(new[] { "Deactivated", "Rejected Slots", "Graduated" }), "Archives report view exposes only the requested three categories.");
        Check(report.Data.Categories.Single(c => c.Reason == "Graduated").Count > 0 && await db.Archives.CountAsync() == archiveCount,
            "Completed batch students appear as Graduated without inserting or rewriting archive records.");
        Check((await portal.GetDashboardAsync(bookkeeping.StudentId)).Data!.ClassSchedules.Count == 0, "Completed Bookkeeping batch retains its schedule visibility restriction.");
        Console.WriteLine("ALL REQUESTED BACKEND UPDATE CHECKS PASSED");

        ApplicationDbContext Context(IInterceptor? interceptor = null, ILoggerFactory? loggerFactory = null)
        {
            var builder = new DbContextOptionsBuilder<ApplicationDbContext>().UseMySql(connection, new MySqlServerVersion(new Version(8, 0, 36)));
            if (interceptor is not null) builder.AddInterceptors(interceptor);
            if (loggerFactory is not null) builder.UseLoggerFactory(loggerFactory);
            return new(builder.Options);
        }
        ActivationService Activation(ApplicationDbContext context) => new(context, new NotificationService(context), new TestPdf(),
            new ArchiveService(context, new NotificationService(context)), new TestEmail(), new TestOptions(), env);
        async Task<Student> Learner(string firstName, string surname, string key)
        {
            var applicant = new Applicant { FirstName = firstName, LastName = surname, Gender = "Male", Birthdate = new(2000, 1, 1),
                ContactNumber = "098" + Random.Shared.Next(10000000, 99999999), Email = key + "@example.invalid", Address = "Verification only",
                CourseId = course.CourseId, BatchId = batch.BatchId, ApplicationStatus = "Confirmed Slot", ApplicationDate = DateTime.Now };
            db.Applicants.Add(applicant); await db.SaveChangesAsync();
            var student = new Student { ApplicantId = applicant.ApplicantId, BatchId = batch.BatchId, SecurityPin = "legacy-" + key, AccountStatus = "Active", CreatedAt = DateTime.Now };
            db.Students.Add(student); await db.SaveChangesAsync(); return student;
        }
    }
    private static void Check(bool success, string label) { if (!success) throw new Exception("FAIL " + label); Console.WriteLine("PASS " + label); }

    private sealed class RecordingProvider(List<string> entries) : ILoggerProvider
    {
        public ILogger CreateLogger(string category) => new RecordingLogger(entries);
        public void Dispose() { }
        private sealed class RecordingLogger(List<string> entries) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
            public bool IsEnabled(LogLevel level) => true;
            public void Log<TState>(LogLevel level, EventId id, TState state, Exception? error, Func<TState, Exception?, string> formatter)
                => entries.Add(formatter(state, error) + error);
        }
    }

    // A writer outside the issuer's advisory-lock convention claims the selected
    // value immediately before the indexed save. The issuer must recover from 1062.
    private sealed class PinCollision(int holderId) : SaveChangesInterceptor
    {
        public bool Injected { get; private set; }
        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData data, InterceptionResult<int> result, CancellationToken ct = default)
        {
            if (!Injected && data.Context is ApplicationDbContext context)
            {
                var pin = context.ChangeTracker.Entries<Student>().FirstOrDefault(e => e.State == EntityState.Modified)?.Entity.SecurityPin;
                if (pin?.StartsWith("ABECRT", StringComparison.Ordinal) == true)
                {
                    Injected = true;
                    await context.Database.ExecuteSqlInterpolatedAsync($"UPDATE students SET security_pin={pin} WHERE student_id={holderId}", ct);
                }
            }
            return result;
        }
    }
}
