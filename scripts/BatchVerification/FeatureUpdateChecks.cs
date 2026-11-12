using ABEC_System.Data;
using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using ABEC_System.Models;
using ABEC_System.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

internal static class FeatureUpdateChecks
{
    public static async Task Run(ApplicationDbContext db, IApplicantService applicants)
    {
        var checks = 0;
        void Check(bool condition, string message) { if (!condition) throw new Exception(message); checks++; }
        foreach (var value in new[] { "San Jose", "Brgy. San Jose", "BRGY San Jose", "Barangay San Jose", "Brgy. Brgy. San Jose", "Bgy.San Jose" })
            Check(AddressFormatting.Barangay(value) == "Brgy. San Jose", "Barangay prefix must be normalized once: " + value);
        Check(AddressFormatting.Barangay("Brgy.") == "", "A prefix alone is not a barangay name.");
        var sample = new Applicant { StreetDetails = "Zone 1", Barangay = "San Jose", CityMunicipality = "Naga", Province = "Camarines Sur" };
        Check(AddressFormatting.FullAddress(sample) == "Zone 1, Brgy. San Jose, Naga, Camarines Sur", "Historical addresses receive the same prefix on display.");
        Check(AddressFormatting.FullAddress(new Applicant { Barangay = "San Jose", Address = "San Jose Street, San Jose, Naga" }) == "San Jose Street, Brgy. San Jose, Naga", "Formatting an imported address preserves a street containing the same name.");
        var courses = new CourseService(db, new CourseHistoryRecorder(db, new HttpContextAccessor()));
        var created = await courses.CreateAsync(new CreateCourseDto { CourseName = "  Office   Administration  ", TrainingDays = 30, OjtDays = 5, HoursPerDay = 8, SlotCapacity = 30 });
        Check(created.Success && created.Data!.CourseName == "Office Administration" && created.Data.TotalHours == 280 && created.Data.Capacity == 30, "New courses save their name, program and capacity.");
        var courseId = created.Data!.CourseId;
        Check((await courses.GetAllAsync()).Data!.Any(c => c.CourseId == courseId), "The shared course catalog immediately includes a newly created course.");
        Check(await db.CourseManagementHistories.AnyAsync(h => h.CourseId == courseId && h.Action == "Course created"), "Course creation is recorded in Review History.");
        Check(!(await courses.CreateAsync(new CreateCourseDto { CourseName = "office administration NC II", TrainingDays = 30 })).Success, "Duplicate course names are rejected regardless of case or NC II suffix.");
        Check(!(await courses.CreateAsync(new CreateCourseDto { CourseName = "Invalid course", TrainingDays = 0 })).Success, "Invalid program lengths cannot be saved.");
        Check(!ScheduleService.TrainingRoomAllowed("Bookkeeping NC II", "Room 301 Computer Lab") && !ScheduleService.TrainingRoomAllowed("Bookkeeping", "Lab 301 – Computer Lab"), "Bookkeeping cannot use any Room/Lab 301 label.");
        Check(ScheduleService.TrainingRoomAllowed("Bookkeeping", "Room 305") && ScheduleService.TrainingRoomAllowed("Computer Systems Servicing", "Room 301 Computer Lab"), "Other room/course combinations remain allowed.");

        var active = await db.Batches.SingleAsync(b => b.Status == "Active");
        var now = DateTime.Now;
        var contactSequence = 0;
        Applicant Offer(string name, DateTime deadline) => new() { FirstName = name, LastName = "Verification", Email = name + "@example.invalid",
            Address = "Synthetic only", Gender = "Male", ContactNumber = "0991234500" + (++contactSequence), Birthdate = new DateTime(2000, 1, 1),
            CourseId = courseId, BatchId = active.BatchId, ApplicationDate = now, ApplicationStatus = "Approved", SlotResponse = "AwaitingResponse",
            ResponseDeadline = deadline, ConfirmationToken = Guid.NewGuid().ToString("N") };
        var expired = Offer("Expired", now.AddHours(-1));
        var pending = Offer("Pending", now.AddHours(1));
        var confirmed = Offer("Confirmed", now.AddHours(-1)); confirmed.ApplicationStatus = "Confirmed Slot"; confirmed.ConfirmedAt = now.AddHours(-2); confirmed.SlotResponse = "Confirmed";
        confirmed.ApprovalEmailSentAt = now.AddHours(-25);
        var declined = Offer("Declined", now.AddHours(-1)); declined.ApplicationStatus = "Declined"; declined.DeclinedAt = now.AddHours(-2); declined.SlotResponse = "Declined";
        var legacy = Offer("Legacy", now.AddHours(-1)); legacy.ApprovalEmailSentAt = now.AddHours(-25);
        db.AddRange(expired, pending, confirmed, declined, legacy); await db.SaveChangesAsync();
        await SlotOfferDeadlineUpgrade.ApplyAsync(db);
        await db.Entry(legacy).ReloadAsync();
        Check(Math.Abs((legacy.ResponseDeadline!.Value - now.AddHours(23)).TotalSeconds) < 1, "Open offers under the previous 24-hour policy receive the remaining 48-hour window.");
        var upgraded = legacy.ResponseDeadline;
        await SlotOfferDeadlineUpgrade.ApplyAsync(db);
        await db.Entry(legacy).ReloadAsync();
        Check(legacy.ResponseDeadline == upgraded, "The deadline upgrade cannot extend an offer more than once.");
        await applicants.ExpireSlotOffersAsync();
        Check(expired.ApplicationStatus == "Expired" && expired.SlotResponse == "Expired", "Unanswered offers expire without a page request.");
        Check(pending.ApplicationStatus == "Approved" && confirmed.ApplicationStatus == "Confirmed Slot" && declined.ApplicationStatus == "Declined", "Expiry preserves unexpired offers and final decisions.");
        Check(await db.Notifications.CountAsync(n => n.ApplicantId == expired.ApplicantId && n.Title == "Applicant Slot Response Expired") == 1, "Expiry sends one admin notification.");
        await applicants.ExpireSlotOffersAsync();
        Check(await db.Notifications.CountAsync(n => n.ApplicantId == expired.ApplicantId && n.Title == "Applicant Slot Response Expired") == 1, "Repeated expiry scans are idempotent.");
        var beforeOffer = DateTime.Now;
        var offer = await applicants.UpdateStatusAsync(expired.ApplicantId, "Approved");
        Check(offer.Success && expired.ResponseDeadline >= beforeOffer.AddHours(48) && expired.ResponseDeadline <= DateTime.Now.AddHours(48), "New and reoffered slots receive exactly 48 hours.");
        await db.Entry(expired).ReloadAsync();
        var deadline = expired.ResponseDeadline;
        await applicants.UpdateStatusAsync(expired.ApplicantId, "Approved");
        Check(expired.ResponseDeadline == deadline, "Approval retries do not extend an existing offer.");
        Console.WriteLine($"PASS {checks} requested feature checks (isolated database).");
    }
}
