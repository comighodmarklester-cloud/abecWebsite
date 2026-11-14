using System.Text.Json;
using ABEC_System.Data;
using ABEC_System.Models;
using ABEC_System.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

internal static class LegacySeedBatchChecks
{
    public static async Task Run(ApplicationDbContext db, Applicant original, TestEnvironment environment)
    {
        var checks = 0;
        void Check(bool value, string label) { if (!value) throw new Exception(label); checks++; Console.WriteLine("PASS " + label); }
        var backup = Path.Combine(environment.ContentRootPath, "cleanup-backups");
        Task<string> Clean() => LegacySeedBatchCleanup.ApplyAsync(db, backup);
        var first = await db.Batches.SingleAsync(b => b.BatchId == original.BatchId);
        db.CourseSchedules.Add(Schedule(first.BatchId)); await db.SaveChangesAsync();
        first.Status = "Completed"; await db.SaveChangesAsync();
        var legacy = new Batch { BatchName = "Batch 2026-A", Status = "Active", StartDate = new(2026, 1, 1), EndDate = new(2026, 12, 31) };
        db.Batches.Add(legacy); await db.SaveChangesAsync();
        var applicant = Learner(legacy.BatchId, "legacy");
        db.Applicants.Add(applicant); await db.SaveChangesAsync();
        var student = new Student { ApplicantId = applicant.ApplicantId, BatchId = legacy.BatchId, SecurityPin = "ABECTL1234", AccountStatus = "Active", CreatedAt = DateTime.Now };
        db.Students.Add(student);
        db.CourseSchedules.Add(Schedule(legacy.BatchId));
        db.Notifications.Add(new() { BatchId = legacy.BatchId, Title = "Verification", Message = "Synthetic batch record", Status = "Unread", CreatedAt = DateTime.Now });
        db.BatchHistories.Add(new() { BatchId = legacy.BatchId, Action = "Batch Completed", ActionDate = DateTime.Now });
        await db.SaveChangesAsync();
        legacy.Status = "Completed"; await db.SaveChangesAsync();
        var current = new Batch { BatchName = "Batch2026-102", Status = "Active", StartDate = DateTime.Today, EndDate = DateTime.Today.AddDays(60) };
        db.Batches.Add(current); await db.SaveChangesAsync();
        var currentApplicant = Learner(current.BatchId, "current");
        db.Applicants.Add(currentApplicant); await db.SaveChangesAsync();
        db.Students.Add(new() { ApplicantId = currentApplicant.ApplicantId, BatchId = current.BatchId, SecurityPin = "ABECTC1234", AccountStatus = "Active", CreatedAt = DateTime.Now });
        db.CourseSchedules.Add(Schedule(current.BatchId)); await db.SaveChangesAsync();
        // Normalize the synthetic fixture through the existing startup upgrades
        // before taking preservation snapshots (for example, room IDs and ages).
        await Startup();
        var before = await Snapshot();
        Check((await Clean()).StartsWith("Skipped") && await db.Students.AnyAsync(s => s.StudentId == student.StudentId), "A populated sample batch and its enrolled students are preserved.");
        await db.Students.Where(s => s.BatchId == legacy.BatchId).ExecuteDeleteAsync();
        Check((await Clean()).StartsWith("Skipped"), "Applicants block removal even with zero enrolled students.");
        await db.Applicants.Where(a => a.BatchId == legacy.BatchId).ExecuteDeleteAsync();
        Check((await Clean()).StartsWith("Skipped"), "Saved schedules block removal of a batch without students or applicants.");
        await db.CourseSchedules.Where(s => s.BatchId == legacy.BatchId).ExecuteDeleteAsync();
        Check((await Clean()).StartsWith("Skipped"), "Batch notifications block removal rather than being discarded.");
        await db.Notifications.Where(n => n.BatchId == legacy.BatchId).ExecuteDeleteAsync();
        await db.Database.ExecuteSqlRawAsync("CREATE TABLE cleanup_unknown_reference (id INT PRIMARY KEY, batch_id INT NOT NULL)");
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO cleanup_unknown_reference VALUES (1,{legacy.BatchId})");
        Check((await Clean()).StartsWith("Skipped"), "Unknown legacy batch_id references without foreign keys block deletion.");
        await db.Database.ExecuteSqlRawAsync("DROP TABLE cleanup_unknown_reference");
        await db.Database.ExecuteSqlRawAsync("CREATE TABLE cleanup_named_reference (id INT PRIMARY KEY, semester_id INT, FOREIGN KEY (semester_id) REFERENCES batches(batch_id) ON DELETE CASCADE)");
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO cleanup_named_reference VALUES (1,{legacy.BatchId})");
        Check((await Clean()).StartsWith("Skipped"), "Differently named foreign keys are checked before a cascade can delete data.");
        await db.Database.ExecuteSqlRawAsync("DROP TABLE cleanup_named_reference");
        await db.Database.ExecuteSqlRawAsync("CREATE TABLE cleanup_history_reference (id INT PRIMARY KEY, history_id INT, FOREIGN KEY (history_id) REFERENCES batchhistory(history_id))");
        Check((await Clean()).StartsWith("Skipped"), "Unknown history dependencies require review.");
        await db.Database.ExecuteSqlRawAsync("DROP TABLE cleanup_history_reference");
        await db.Database.ExecuteSqlRawAsync("CREATE TRIGGER cleanup_delete_probe AFTER DELETE ON batches FOR EACH ROW SET @cleanup_probe=1");
        Check((await Clean()).StartsWith("Skipped"), "Unexpected deletion triggers prevent unreviewed side effects.");
        await db.Database.ExecuteSqlRawAsync("DROP TRIGGER cleanup_delete_probe");
        await db.Batches.Where(b => b.BatchId == current.BatchId).ExecuteUpdateAsync(s => s.SetProperty(b => b.Status, "Draft"));
        Check((await Clean()).StartsWith("Skipped"), "Cleanup cannot run when Batch2026-102 is not the current active batch.");
        await db.Batches.Where(b => b.BatchId == current.BatchId).ExecuteUpdateAsync(s => s.SetProperty(b => b.Status, "Active"));
        await db.Batches.Where(b => b.BatchId == legacy.BatchId).ExecuteUpdateAsync(s => s.SetProperty(b => b.Status, "Draft"));
        Check((await Clean()).StartsWith("Skipped"), "Noncompleted sample batches cannot be removed.");
        await db.Batches.Where(b => b.BatchId == legacy.BatchId).ExecuteUpdateAsync(s => s.SetProperty(b => b.Status, "Completed"));
        await db.Batches.Where(b => b.BatchId == legacy.BatchId).ExecuteUpdateAsync(s => s.SetProperty(b => b.StartDate, new DateTime(2026, 2, 1)));
        Check((await Clean()).StartsWith("Skipped"), "A similarly named batch with different dates is not mistaken for the original seed.");
        await db.Batches.Where(b => b.BatchId == legacy.BatchId).ExecuteUpdateAsync(s => s.SetProperty(b => b.StartDate, new DateTime(2026, 1, 1)));
        var ambiguous = new Batch { BatchName = "Batch2026-A", Status = "Completed", StartDate = DateTime.Today, EndDate = DateTime.Today.AddDays(30) };
        db.Batches.Add(ambiguous); await db.SaveChangesAsync();
        Check((await Clean()).StartsWith("Skipped"), "Ambiguous duplicate sample names are preserved for review.");
        await db.Batches.Where(b => b.BatchId == ambiguous.BatchId).ExecuteDeleteAsync();
        Check(!Directory.Exists(backup), "Skipped cleanups do not write backups or delete any history.");
        Directory.CreateDirectory(environment.ContentRootPath);
        var blockedBackup = Path.Combine(environment.ContentRootPath, "blocked-backup");
        await File.WriteAllTextAsync(blockedBackup, "Synthetic filesystem failure");
        try { await LegacySeedBatchCleanup.ApplyAsync(db, blockedBackup); throw new Exception("Expected backup failure."); }
        catch (IOException) { Check(await db.Batches.AnyAsync(b => b.BatchId == legacy.BatchId) && await db.BatchHistories.AnyAsync(h => h.BatchId == legacy.BatchId), "Backup failure leaves the batch and its lifecycle history intact."); }
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseMySql(db.Database.GetConnectionString(), new MySqlServerVersion(new Version(8, 0, 36))).Options;
        await using var one = new ApplicationDbContext(options);
        await using var two = new ApplicationDbContext(options);
        var results = await Task.WhenAll(LegacySeedBatchCleanup.ApplyAsync(one, backup), LegacySeedBatchCleanup.ApplyAsync(two, backup));
        Check(results.Count(r => r.StartsWith("Removed")) == 1 && results.Count(r => r == "Absent") == 1, "Concurrent cleanup removes the empty sample once and is idempotent.");
        Check(!await db.Batches.AnyAsync(b => b.BatchId == legacy.BatchId) && !await db.BatchHistories.AnyAsync(h => h.BatchId == legacy.BatchId), "Only the empty sample batch and its own lifecycle event are removed.");
        var files = Directory.GetFiles(backup, "*.json");
        using var saved = JsonDocument.Parse(await File.ReadAllTextAsync(files.Single()));
        Check(saved.RootElement.GetProperty("Batch").GetProperty("BatchId").GetInt32() == legacy.BatchId
            && saved.RootElement.GetProperty("History").GetArrayLength() == 1, "A private JSON backup preserves the exact removed batch and lifecycle metadata.");
        Check(await Snapshot() == before, "Both valid batches, enrollments, PINs, schedules and history remain unchanged.");
        var batches = new BatchService(db);
        Check((await batches.GetActiveAsync()).Data?.BatchId == current.BatchId
            && (await batches.GetHistoryAsync()).Data!.Single().BatchId == first.BatchId, "History contains only Batch2026-101 and Batch2026-102 remains current.");
        var unrelated = new Batch { BatchName = "Unrelated empty history", Status = "Completed", StartDate = DateTime.Today, EndDate = DateTime.Today.AddDays(30) };
        db.Batches.Add(unrelated); await db.SaveChangesAsync();
        Check(await Clean() == "Absent" && await db.Batches.AnyAsync(b => b.BatchId == unrelated.BatchId), "Unrelated empty historical batches are never removed.");
        await db.Batches.Where(b => b.BatchId == unrelated.BatchId).ExecuteDeleteAsync();
        var canonical = new Batch { BatchName = "Batch2026-A", Status = "Completed", StartDate = new(2026, 1, 1), EndDate = new(2026, 12, 31) };
        db.Batches.Add(canonical); await db.SaveChangesAsync();
        Check((await Clean()).StartsWith("Removed") && !await db.Batches.AnyAsync(b => b.BatchId == canonical.BatchId), "The requested unspaced sample name is handled with the same safeguards.");
        await Startup(); await Startup();
        Check(await db.Batches.CountAsync() == 2 && await Snapshot() == before, "Repeated real startup cannot recreate the sample or change the valid batch records.");
        await db.Database.ExecuteSqlRawAsync("DELETE FROM notifications");
        await db.Database.ExecuteSqlRawAsync("DELETE FROM courseschedules");
        await db.Database.ExecuteSqlRawAsync("DELETE FROM student_document_eligibility");
        await db.Database.ExecuteSqlRawAsync("DELETE FROM students");
        await db.Database.ExecuteSqlRawAsync("DELETE FROM applicants");
        await db.Database.ExecuteSqlRawAsync("DELETE FROM batchhistory");
        await db.Database.ExecuteSqlRawAsync("DELETE FROM batches");
        await Startup();
        Check(!await db.Batches.AnyAsync(), "An empty installation does not automatically create a sample batch.");
        Console.WriteLine($"PASS {checks} guarded legacy seed batch cleanup checks.");

        Applicant Learner(int batchId, string key) => new() { BatchId = batchId, CourseId = original.CourseId, FirstName = "Test", LastName = key,
            Gender = "Male", Birthdate = new(2000, 1, 1), ContactNumber = key == "legacy" ? "09123456781" : "09123456782",
            Email = key + "@example.invalid", Address = "Verification only", ApplicationDate = DateTime.Now, ApplicationStatus = "Confirmed Slot" };
        CourseSchedule Schedule(int batchId) => new() { BatchId = batchId, CourseId = original.CourseId, ScheduleDate = DateTime.Today,
            StartTime = TimeSpan.FromHours(8), EndTime = TimeSpan.FromHours(16), Room = "Verification room", Trainer = "Verification trainer", TrainingDays = "Mon,Wed,Fri", Status = "Active" };
        async Task Startup()
        {
            using var services = new ServiceCollection().AddDbContext<ApplicationDbContext>(o => o.UseMySql(db.Database.GetConnectionString(), new MySqlServerVersion(new Version(8, 0, 36)))).BuildServiceProvider();
            await DbSeeder.SeedAsync(services);
        }
        async Task<string> Snapshot() => JsonSerializer.Serialize(new {
            Batches = await db.Batches.AsNoTracking().Where(b => b.BatchId == first.BatchId || b.BatchId == current.BatchId).OrderBy(b => b.BatchId).ToListAsync(),
            Applicants = await db.Applicants.AsNoTracking().Where(a => a.BatchId == first.BatchId || a.BatchId == current.BatchId).OrderBy(a => a.ApplicantId).ToListAsync(),
            Students = await db.Students.AsNoTracking().Where(s => s.BatchId == first.BatchId || s.BatchId == current.BatchId).OrderBy(s => s.StudentId).ToListAsync(),
            Schedules = await db.CourseSchedules.AsNoTracking().Where(s => s.BatchId == first.BatchId || s.BatchId == current.BatchId).OrderBy(s => s.ScheduleId).ToListAsync(),
            History = await db.BatchHistories.AsNoTracking().Where(h => h.BatchId == first.BatchId || h.BatchId == current.BatchId).OrderBy(h => h.HistoryId).ToListAsync()
        });
    }
}
