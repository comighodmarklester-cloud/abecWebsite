using ABEC_System.Data;
using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using ABEC_System.Models;
using ABEC_System.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

internal static class TrainingScheduleChecks
{
    public static async Task Run(ApplicationDbContext db, Student studentA,
        IDocumentRequestService documents, INotificationService notifications, IHttpContextAccessor accessor)
    {
        var portal = new StudentPortalService(db, documents, notifications);
        var schedules = new ScheduleService(db, notifications, new CourseHistoryRecorder(db, accessor));
        var courseA = (await db.Applicants.FindAsync(studentA.ApplicantId))!.CourseId;
        var courseB = new Course { CourseName = "Schedule verification course B", Duration = "35 days", Status = "Available", SlotCapacity = 25 };
        db.Courses.Add(courseB);
        db.TrainingRooms.Add(new() { RoomName = "Schedule verification room" });
        await db.SaveChangesAsync();
        var studentB = await Learner(courseB.CourseId, studentA.BatchId, "other-course");
        Check((await portal.GetScheduleAsync(studentA.StudentId)).Data!.Count == 0, "Unassigned enrollment has no schedule.");

        CreateScheduleDto NewSchedule(int batchId) => new()
        {
            CourseId = courseA, BatchId = batchId, ScheduleDate = DateTime.Today,
            StartTime = TimeSpan.FromHours(8), EndTime = TimeSpan.FromHours(16),
            Room = "Schedule verification room", Trainer = "Schedule verification trainer",
            TrainingDays = "Mon,Wed,Fri", Status = "Active"
        };
        var created = await schedules.CreateAsync(NewSchedule(studentA.BatchId));
        Check(created.Success, "Admin creates the course schedule: " + created.Message);
        var scheduleId = created.Data!.ScheduleId;
        db.ChangeTracker.Clear();
        var saved = await db.CourseSchedules.AsNoTracking().SingleAsync(s => s.ScheduleId == scheduleId);
        Check(saved.CourseId == courseA && saved.BatchId == studentA.BatchId && saved.TrainingDays == "Mon,Wed,Fri", "Admin saves course, batch and training days in MySQL.");
        var dashboard = (await portal.GetDashboardAsync(studentA.StudentId)).Data!;
        Check(dashboard.ClassSchedules.Count == 1 && dashboard.UpcomingClasses.Single().ScheduleId == scheduleId, "Matching enrollment receives the saved schedule on the dashboard.");
        Check(dashboard.ClassSchedules.Single().TrainingDays == saved.TrainingDays
            && dashboard.ClassSchedules.Single().BatchStartDate == created.Data.BatchStartDate
            && dashboard.ClassSchedules.Single().CourseName == created.Data.CourseName, "Admin and student return the same saved course, weekdays and batch dates.");
        Check((await portal.GetScheduleAsync(studentB.StudentId)).Data!.Count == 0, "Course B cannot see Course A's schedule.");
        Check(!await db.Notifications.AnyAsync(n => n.StudentId == studentB.StudentId), "Schedule notifications do not reach unrelated courses.");
        Check(!(await schedules.CreateAsync(NewSchedule(studentA.BatchId))).Success, "Duplicate active schedules are rejected.");
        db.ChangeTracker.Clear();

        var updated = await schedules.UpdateAsync(scheduleId, new()
        {
            ScheduleDate = DateTime.Today.AddDays(-1), StartTime = TimeSpan.FromHours(9),
            EndTime = TimeSpan.FromHours(17), TrainingDays = "Tue,Thu", Trainer = "Updated verification trainer"
        });
        Check(updated.Success, "Admin updates the schedule: " + updated.Message);
        db.ChangeTracker.Clear();
        dashboard = (await portal.GetDashboardAsync(studentA.StudentId)).Data!;
        var latest = dashboard.ClassSchedules.Single();
        Check(latest.ScheduleDate == DateTime.Today.AddDays(-1) && latest.StartTime == TimeSpan.FromHours(9)
            && latest.EndTime == TimeSpan.FromHours(17) && latest.TrainingDays == "Tue,Thu"
            && latest.Trainer == "Updated verification trainer", "Dashboard retrieves updated saved date, days, times and trainer, including a past start date.");
        var legacy = await db.CourseSchedules.SingleAsync(s => s.ScheduleId == scheduleId);
        legacy.TrainerAssignments = "";
        await db.SaveChangesAsync();
        Check((await portal.GetScheduleAsync(studentA.StudentId)).Data!.Single().Trainers.Single().Name == latest.Trainer,
            "Student and admin mapping both preserve legacy trainer assignments.");
        Check(dashboard.UpcomingClasses.Single().ScheduleId == scheduleId, "A past start date does not hide the current assigned schedule.");
        Check((await schedules.UpdateAsync(scheduleId, new() { Status = "Inactive" })).Success, "Admin deactivates a schedule.");
        Check((await portal.GetDashboardAsync(studentA.StudentId)).Data!.ClassSchedules.Count == 0, "Unavailable schedules disappear from the dashboard.");
        Check((await schedules.UpdateAsync(scheduleId, new() { Status = "Active" })).Success, "Admin reactivates a schedule.");

        var replacementDto = NewSchedule(studentA.BatchId);
        replacementDto.ReplaceScheduleId = scheduleId;
        var replaced = await schedules.CreateAsync(replacementDto);
        Check(replaced.Success, "Admin replaces an active schedule atomically: " + replaced.Message);
        Check((await portal.GetScheduleAsync(studentA.StudentId)).Data!.Single().ScheduleId == replaced.Data!.ScheduleId, "Replacement displays once and the outdated schedule is excluded.");
        Check((await schedules.DeleteAsync(replaced.Data!.ScheduleId)).Success, "Admin deletes the replacement schedule.");
        Check((await portal.GetScheduleAsync(studentA.StudentId)).Data!.Count == 0, "Deleted schedules do not fall back to inactive schedules.");

        // Preserve a saved schedule while switching training cycles, as in the local data.
        Check((await schedules.UpdateAsync(scheduleId, new() { Status = "Active" })).Success, "Prepare the original batch schedule.");
        var historical = await db.CourseSchedules.SingleAsync(s => s.ScheduleId == scheduleId);
        historical.RoomId = null;
        historical.Room = "  Schedule verification room  ";
        await db.SaveChangesAsync();
        var secondBatch = await new BatchService(db).CreateAsync(new()
        {
            BatchName = "Schedule verification next batch", StartDate = DateTime.Today.AddDays(1),
            EndDate = DateTime.Today.AddDays(60), ActivateNow = true, ConfirmSwitch = true
        });
        Check(secondBatch.Success, "Activate a second batch without moving enrollment records.");
        var studentNextBatch = await Learner(courseA, secondBatch.Data!.BatchId, "next-batch");
        Check((await portal.GetScheduleAsync(studentNextBatch.StudentId)).Data!.Count == 0, "Same course in a different batch cannot inherit the previous schedule.");
        var nextSchedule = await schedules.CreateAsync(NewSchedule(secondBatch.Data.BatchId));
        Check(nextSchedule.Success, "New batch saves an independent schedule.");
        Check((await portal.GetScheduleAsync(studentNextBatch.StudentId)).Data!.Single().ScheduleId == nextSchedule.Data!.ScheduleId, "New enrollment receives only its own batch schedule.");
        var completedDashboard = (await portal.GetDashboardAsync(studentA.StudentId)).Data!;
        Check(!completedDashboard.Profile.CanViewTrainingSchedule && completedDashboard.ClassSchedules.Count == 0
            && completedDashboard.UpcomingClasses.Count == 0,
            "Completed enrollment cannot view schedules from either its old batch or the new active batch.");
        Check((await portal.GetScheduleAsync(studentB.StudentId)).Data!.Count == 0,
            "Completed enrollment with no course schedule still receives an empty schedule.");
        Check((await db.Students.AsNoTracking().SingleAsync(s => s.StudentId == studentA.StudentId)).BatchId == studentA.BatchId, "Existing enrollment remains assigned to its original batch.");
        Check((await portal.GetProfileAsync(studentA.StudentId)).Data!.CourseId == courseA
            && (await portal.GetDashboardAsync(studentA.StudentId)).Success, "Existing profile and dashboard remain available after a batch switch.");
        var connection = db.Database.GetConnectionString()!;
        using var startup = new ServiceCollection().AddDbContext<ApplicationDbContext>(options =>
            options.UseMySql(connection, ServerVersion.AutoDetect(connection))).BuildServiceProvider();
        await DbSeeder.SeedAsync(startup);
        await DbSeeder.SeedAsync(startup);
        historical = await db.CourseSchedules.AsNoTracking().SingleAsync(s => s.ScheduleId == scheduleId);
        Check(historical.RoomId is null && historical.Room == "  Schedule verification room  ",
            "Repeated startup preserves completed legacy schedule rooms without tripping the history write guard.");
        Check((await portal.GetScheduleAsync(studentNextBatch.StudentId)).Data!.Single().ScheduleId == nextSchedule.Data!.ScheduleId,
            "Startup keeps the active student's saved schedule available.");

        async Task<Student> Learner(int courseId, int batchId, string key)
        {
            var applicant = new Applicant
            {
                FirstName = "Schedule", LastName = key, Gender = "Female", Birthdate = new(2000, 1, 1),
                ContactNumber = key == "other-course" ? "09121110001" : "09121110002",
                Email = key + "@example.invalid", Address = "Verification only", CourseId = courseId,
                BatchId = batchId, ApplicationStatus = "Confirmed Slot", ApplicationDate = DateTime.Now
            };
            db.Applicants.Add(applicant);
            await db.SaveChangesAsync();
            var student = new Student { ApplicantId = applicant.ApplicantId, BatchId = batchId, SecurityPin = key, AccountStatus = "Active" };
            db.Students.Add(student);
            await db.SaveChangesAsync();
            return student;
        }
    }

    private static void Check(bool condition, string message)
    {
        if (!condition) throw new Exception("FAIL " + message);
        Console.WriteLine("PASS " + message);
    }
}
