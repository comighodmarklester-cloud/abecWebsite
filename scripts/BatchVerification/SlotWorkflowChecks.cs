using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using ABEC_System.Data;
using ABEC_System.Models;
using ABEC_System.Options;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using MimeKit;

internal static class SlotWorkflowChecks
{
    public static async Task Run(ApplicationDbContext db, string connection, IWebHostEnvironment environment)
    {
        var checks = 0;
        void Check(bool condition, string message) { if (!condition) throw new Exception(message); checks++; }
        var batch = await db.Batches.SingleAsync(b => b.Status == "Active");
        var course = new Course { CourseName = "Slot workflow verification", Duration = "35 days", Status = "Available", SlotCapacity = 3 };
        db.Courses.Add(course); await db.SaveChangesAsync();
        var records = Enumerable.Range(1, 8).Select(i => new Applicant
        {
            FirstName = "Workflow" + i, MiddleName = "Test", LastName = "Applicant", Email = $"workflow{i}@example.invalid",
            ContactNumber = "0990000000" + i, Address = "Synthetic verification only", Gender = "Male", Birthdate = new DateTime(2000, 1, i),
            CourseId = course.CourseId, BatchId = batch.BatchId, ApplicationDate = DateTime.Now, ApplicationStatus = "Pending"
        }).ToArray();
        db.Applicants.AddRange(records); await db.SaveChangesAsync();
        var unattended = new Applicant { FirstName = "Unattended", LastName = "Offer", Email = "unattended@example.invalid", ContactNumber = "09900000099",
            Address = "Synthetic verification only", Gender = "Male", Birthdate = new DateTime(2000, 1, 1), CourseId = course.CourseId, BatchId = batch.BatchId,
            ApplicationDate = DateTime.Now.AddDays(-3), ApplicationStatus = "Approved", SlotResponse = "AwaitingResponse", ResponseDeadline = DateTime.Now.AddHours(-1) };
        db.Applicants.Add(unattended); await db.SaveChangesAsync();
        await using var smtp = new MailSink();
        var activationObservations = new ConcurrentQueue<bool>();
        smtp.OnMessage = async message =>
        {
            if (message.Subject != "Your ABEC Student Account Is Now Active") return;
            // Observe through another connection while SMTP is still accepting the message.
            await using var observedDb = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseMySql(connection, new MySqlServerVersion(new Version(8, 0, 36))).Options);
            var recipient = message.To.Mailboxes.Single().Address;
            var saved = await observedDb.Students.AsNoTracking().Include(s => s.Applicant)
                .SingleAsync(s => s.Applicant!.Email == recipient);
            activationObservations.Enqueue(saved.AccountStatus == "Active"
                && message.HtmlBody!.Contains(WebUtility.HtmlEncode(saved.SecurityPin))
                && message.HtmlBody.Contains(WebUtility.HtmlEncode(saved.Applicant!.FullName)));
        };
        var port = FreePort();
        using var https = new VerificationHttps(environment.ContentRootPath);
        var origin = "https://127.0.0.1:" + port;
        var start = new ProcessStartInfo("dotnet") { UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardOutput = true, RedirectStandardError = true, WorkingDirectory = Directory.GetCurrentDirectory() };
        start.ArgumentList.Add(Path.Combine(AppContext.BaseDirectory, "ABEC System.dll"));
        start.ArgumentList.Add("--urls"); start.ArgumentList.Add(origin);
        foreach (var pair in new Dictionary<string, string>
        {
            ["ASPNETCORE_ENVIRONMENT"] = "Development", ["ConnectionStrings__DefaultConnection"] = connection,
            ["App__PublicBaseUrl"] = AppSettings.DefaultProductionBaseUrl, ["Email__Enabled"] = "true", ["Email__Host"] = "127.0.0.1",
            ["Email__Port"] = smtp.Port.ToString(), ["Email__UseSsl"] = "false", ["Email__Username"] = "local-smtp-test",
            ["Email__Password"] = VerificationAccounts.Password, ["Email__FromAddress"] = "abec@example.invalid", ["Email__FromName"] = "ABEC",
            ["Email__PickupDirectory"] = environment.ContentRootPath
        }) start.Environment[pair.Key] = pair.Value;
        https.Configure(start);
        using var process = Process.Start(start)!;
        // Drain child output without printing configuration or bearer links.
        var stdout = process.StandardOutput.ReadToEndAsync(); var stderr = process.StandardError.ReadToEndAsync();
        try
        {
            using var browser = https.Client(new Uri(origin));
            using var admin = https.Client(new Uri(origin));
            for (var attempt = 0; ; attempt++)
            {
                try { if ((await browser.GetAsync("/api/health")).IsSuccessStatusCode) break; } catch (HttpRequestException) { }
                if (attempt >= 80 || process.HasExited) throw new Exception("Verification server did not start.");
                await Task.Delay(250);
            }
            using var login = await admin.PostAsync("/api/auth/admin-login", Json(new { username = VerificationAccounts.AdminUsername, password = VerificationAccounts.Password }));
            Check(login.IsSuccessStatusCode, "Test admin must sign in.");
            for (var attempt = 0; attempt < 20 && await db.Applicants.AsNoTracking().AnyAsync(a => a.ApplicantId == unattended.ApplicantId && a.ApplicationStatus == "Approved"); attempt++)
                await Task.Delay(250);
            Check(await db.Applicants.AsNoTracking().AnyAsync(a => a.ApplicantId == unattended.ApplicantId && a.ApplicationStatus == "Expired" && a.SlotResponse == "Expired"),
                "The hosted worker must expire an unattended offer without anyone opening its record.");
            using var unauthorizedCourse = await browser.PostAsync("/api/courses", Json(new { courseName = "Unauthorized course", trainingDays = 10 }));
            Check(unauthorizedCourse.StatusCode == HttpStatusCode.Unauthorized, "Only signed-in administrators can create courses.");
            async Task<JsonElement> Data(string path)
            {
                using var response = await admin.GetAsync(path); response.EnsureSuccessStatusCode();
                using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
                return document.RootElement.GetProperty("data").Clone();
            }
            async Task<JsonElement> Approve(int index)
            {
                using var response = await admin.PutAsync($"/api/applicants/{records[index].ApplicantId}/status", Json(new { status = "Approved" }));
                response.EnsureSuccessStatusCode();
                using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
                return document.RootElement.Clone();
            }
            async Task<Applicant> Saved(int index) => await db.Applicants.AsNoTracking().SingleAsync(a => a.ApplicantId == records[index].ApplicantId);
            async Task<string> Submit(string path, string token)
            {
                using var response = await browser.PostAsync(path, new FormUrlEncodedContent(new Dictionary<string, string> { ["token"] = token }));
                response.EnsureSuccessStatusCode(); return await response.Content.ReadAsStringAsync();
            }
            async Task<string> Scan(string path, string token)
            {
                using var response = await browser.GetAsync(path + "?token=" + Uri.EscapeDataString(token));
                Check(response.Headers.CacheControl?.NoStore == true && response.Headers.GetValues("Referrer-Policy").Single() == "no-referrer", "Slot pages must not cache or leak bearer links through referrers.");
                return await response.Content.ReadAsStringAsync();
            }
            var first = await Approve(0);
            Check(first.GetProperty("success").GetBoolean(), "Pending approval must save and send.");
            var approved = await Saved(0);
            Check(approved.ApplicationStatus == "Approved" && approved.ApprovalEmailSentAt.HasValue && approved.ResponseDeadline > DateTime.Now,
                "Approval, successful delivery and expiry must be stored.");
            Check(approved.ConfirmationToken?.Length == 64, "Offer must use a random 256-bit token.");
            Check((approved.ResponseDeadline!.Value - DateTime.Now).TotalHours is > 47.98 and <= 48,
                "The offered slot must give the applicant 2 days (48 hours) to confirm.");
            var message = smtp.Messages.Single();
            Check(message.From.Mailboxes.Single().Name == "ABEC" && message.From.Mailboxes.Single().Address == "abec@example.invalid"
                && message.To.Mailboxes.Single().Address == records[0].Email, "Actual SMTP message must use ABEC sender and the applicant's registered recipient.");
            var html = message.HtmlBody ?? throw new Exception("Approval email is missing its HTML body.");
            Check(html.Contains(">Confirm Slot</a>") && html.Contains(">Reject Slot</a>"), "Email must contain both requested button labels.");
            Check(html.Contains(AppSettings.DefaultProductionBaseUrl + "/confirm-slot?token=" + approved.ConfirmationToken)
                && html.Contains(AppSettings.DefaultProductionBaseUrl + "/reject-slot?token=" + approved.ConfirmationToken)
                && !html.Contains("http://localhost:5188"), "Both buttons must use the public HTTPS URL and the same individual offer.");
            var attachment = message.Attachments.OfType<MimePart>().Single();
            using var pdf = new MemoryStream(); attachment.Content!.DecodeTo(pdf);
            Check(Encoding.ASCII.GetString(pdf.ToArray(), 0, 5) == "%PDF-" && attachment.FileName!.Contains("_" + records[0].ApplicantId + ".pdf"),
                "Actual email must attach the applicant's own generated PDF.");
            var output = Path.GetFullPath("artifacts/slot-workflow"); Directory.CreateDirectory(output);
            File.WriteAllBytes(Path.Combine(output, "application.pdf"), pdf.ToArray());
            var confirmIntent = await Scan("/confirm-slot", approved.ConfirmationToken!);
            Check(confirmIntent.Contains("<form method=\"post\""), "Opening Confirm must show a form.");
            var anonymousCsrf = Regex.Match(confirmIntent, "name=\"__RequestVerificationToken\" value=\"([^\"]+)\"").Groups[1].Value;
            Check(anonymousCsrf.Length > 20, "Slot forms must carry a server-generated anti-forgery token.");
            Check((await Scan("/reject-slot", approved.ConfirmationToken!)).Contains("Reject Slot"), "Opening Reject must show a form.");
            Check((await Saved(0)).ApplicationStatus == "Approved" && !await db.Students.AnyAsync(s => s.ApplicantId == records[0].ApplicantId),
                "Email scanner GETs must leave the application and enrollment unchanged.");
            foreach (var attack in new[] {
                (Nonce: "", Site: "same-origin", Path: "/confirm-slot"),
                (Nonce: Guid.NewGuid().ToString("N"), Site: "same-origin", Path: "/confirm-slot/"),
                (Nonce: anonymousCsrf, Site: "cross-site", Path: "/confirm-slot"),
                (Nonce: anonymousCsrf, Site: "same-site", Path: "/confirm-slot") })
            {
                using var forged = new HttpRequestMessage(HttpMethod.Post, attack.Path);
                forged.Headers.Add("Origin", "null"); forged.Headers.Add("Sec-Fetch-Site", attack.Site);
                forged.Content = new FormUrlEncodedContent(new Dictionary<string, string> { ["token"] = approved.ConfirmationToken!, ["__RequestVerificationToken"] = attack.Nonce });
                using var response = await browser.SendAsync(forged);
                Check(response.StatusCode == HttpStatusCode.Forbidden && (await Saved(0)).ApplicationStatus == "Approved", "Unverified or cross-site null-Origin slot submissions must not change the offer.");
            }
            var adminIntent = await admin.GetStringAsync("/confirm-slot?token=" + approved.ConfirmationToken);
            var adminCsrf = Regex.Match(adminIntent, "name=\"__RequestVerificationToken\" value=\"([^\"]+)\"").Groups[1].Value;
            using (var choice = new HttpRequestMessage(HttpMethod.Post, "/confirm-slot"))
            {
                choice.Headers.Add("Origin", "null"); choice.Headers.Add("Sec-Fetch-Site", "same-origin");
                choice.Content = new FormUrlEncodedContent(new Dictionary<string, string> { ["token"] = approved.ConfirmationToken!, ["__RequestVerificationToken"] = adminCsrf });
                using var response = await admin.SendAsync(choice);
                Check(response.IsSuccessStatusCode && (await response.Content.ReadAsStringAsync()).Contains("Slot Confirmed Successfully"), "A valid anti-forgery pair permits privacy-suppressed form Origin even with an existing authenticated session.");
            }
            var activation = await Data($"/api/activations?status=pending&batchId={batch.BatchId}");
            Check(activation.EnumerateArray().Any(s => s.GetProperty("applicantId").GetInt32() == records[0].ApplicantId && s.GetProperty("accountStatus").GetString() == "Inactive"),
                "Confirmed applicant must appear in Account Activation Pending.");
            Check((await Submit("/confirm-slot", approved.ConfirmationToken!)).Contains("Slot Confirmed Successfully")
                && (await Submit("/reject-slot", approved.ConfirmationToken!)).Contains("Slot Confirmed Successfully"), "Both repeated POSTs must show the saved confirmation without changing it.");
            Check((await Scan("/reject-slot", approved.ConfirmationToken!)).Contains("Slot Confirmed Successfully"), "The opposite email link must also show the saved result.");
            Check(await db.Students.CountAsync(s => s.ApplicantId == records[0].ApplicantId) == 1, "Repeated confirmation must not create duplicate students.");

            await Approve(1); var reject = await Saved(1);
            Check((await Submit("/reject-slot", reject.ConfirmationToken!)).Contains("Slot Rejected Successfully"), "Reject POST must save the choice.");
            var rejected = await Saved(1);
            Check(rejected.ApplicationStatus == "Rejected" && rejected.SlotResponse == "Declined" && rejected.DeclinedAt.HasValue
                && rejected.BatchId == batch.BatchId && rejected.CourseId == course.CourseId, "Rejection must retain its decision, course and batch.");
            Check(rejected.ConfirmationToken == reject.ConfirmationToken && !await db.Students.AnyAsync(s => s.ApplicantId == rejected.ApplicantId), "Rejected applicants retain a replayable result without a student account.");
            Check((await Submit("/confirm-slot", reject.ConfirmationToken!)).Contains("Slot Rejected Successfully")
                && (await Submit("/reject-slot", reject.ConfirmationToken!)).Contains("Slot Rejected Successfully"), "A saved rejection must survive repeated and opposing submissions.");
            var rejectedList = await Data($"/api/applicants?status=rejected&batchId={batch.BatchId}");
            Check(rejectedList.EnumerateArray().Any(a => a.GetProperty("applicantId").GetInt32() == records[1].ApplicantId), "Rejected choice must appear in the Applicants Rejected table.");
            var graph = await Data($"/api/archives/categories?batchId={batch.BatchId}&courseId={course.CourseId}");
            Check(graph.GetProperty("categories").EnumerateArray().Single(c => c.GetProperty("reason").GetString() == "Rejected Slots").GetProperty("count").GetInt32() == 1,
                "Archives Rejected Slots must include the applicant in the matching course and batch.");

            smtp.RejectNext = true;
            var failed = await Approve(2); var failedRecord = await Saved(2);
            Check(failed.GetProperty("success").GetBoolean() && failed.GetProperty("message").GetString()!.StartsWith("EMAIL_NOT_SENT:")
                && failed.GetProperty("data").GetProperty("canRetryApprovalEmail").GetBoolean(), "Delivery failure must preserve approval, tell the admin and enable retry.");
            Check(failedRecord.ApplicationStatus == "Approved" && !failedRecord.ApprovalEmailSentAt.HasValue, "Approval remains committed after SMTP failure.");
            var tokenBeforeRetry = failedRecord.ConfirmationToken; var deadlineBeforeRetry = failedRecord.ResponseDeadline; var countBeforeRetry = smtp.Messages.Count;
            await Task.WhenAll(Approve(2), Approve(2));
            var retried = await Saved(2);
            Check(retried.ConfirmationToken == tokenBeforeRetry && retried.ResponseDeadline == deadlineBeforeRetry && retried.ApprovalEmailSentAt.HasValue,
                "Retry must reuse the existing approval, token and expiry.");
            Check(smtp.Messages.Count == countBeforeRetry + 1, "Concurrent retries must send one approval email.");
            Check(await db.Notifications.CountAsync(n => n.ApplicantId == retried.ApplicantId && n.Title == "Application Status Updated") == 1,
                "Retrying delivery must not create a duplicate approval notification.");
            await Approve(2); Check(smtp.Messages.Count == countBeforeRetry + 1, "Retrying a successfully delivered approval must not send another email.");

            await Approve(3); var expired = await Saved(3);
            await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE applicants SET response_deadline={DateTime.Now.AddMinutes(-1)} WHERE applicant_id={expired.ApplicantId}");
            Check((await Scan("/confirm-slot", expired.ConfirmationToken!)).Contains("expired"), "Expired offers must show an expired page.");
            Check((await Saved(3)).ApplicationStatus == "Approved", "Opening an expired link must not mutate status.");
            Check((await Submit("/confirm-slot", expired.ConfirmationToken!)).Contains("expired") && !await db.Students.AnyAsync(s => s.ApplicantId == expired.ApplicantId), "Expired POST must not enroll anyone.");
            Check((await Scan("/confirm-slot", new string('0', 64))).Contains("invalid"), "Unknown tokens must not expose a form or update another applicant.");

            await Approve(4); var racing = await Saved(4);
            await Task.WhenAll(Submit("/confirm-slot", racing.ConfirmationToken!), Submit("/reject-slot", racing.ConfirmationToken!));
            var winner = await Saved(4);
            Check(winner.SlotResponse is "Confirmed" or "Declined", "Simultaneous choices must save exactly one final result.");
            Check(await db.Students.CountAsync(s => s.ApplicantId == winner.ApplicantId) == (winner.SlotResponse == "Confirmed" ? 1 : 0), "The enrollment must match the winning decision.");
            var winnerResult = winner.SlotResponse == "Confirmed" ? "Slot Confirmed Successfully" : "Slot Rejected Successfully";
            Check((await Submit("/confirm-slot", racing.ConfirmationToken!)).Contains(winnerResult) && (await Submit("/reject-slot", racing.ConfirmationToken!)).Contains(winnerResult), "Decision replays must agree after a race.");
            var lastSlotCourse = new Course { CourseName = "Last-slot verification", Duration = "35 days", Status = "Available", SlotCapacity = 1 };
            db.Courses.Add(lastSlotCourse); await db.SaveChangesAsync();
            foreach (var record in records.Skip(5).Take(2))
                await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE applicants SET course_id={lastSlotCourse.CourseId} WHERE applicant_id={record.ApplicantId}");
            await Task.WhenAll(Approve(5), Approve(6));
            var lastSlotA = await Saved(5); var lastSlotB = await Saved(6);
            var capacityResults = await Task.WhenAll(Submit("/confirm-slot", lastSlotA.ConfirmationToken!), Submit("/confirm-slot", lastSlotB.ConfirmationToken!));
            Check(capacityResults.Count(r => r.Contains("Slot Confirmed Successfully")) == 1 && capacityResults.Count(r => r.Contains("capacity")) == 1,
                "Only one applicant can confirm the last available slot.");
            Check(await db.Students.CountAsync(s => s.Applicant!.CourseId == lastSlotCourse.CourseId && s.BatchId == batch.BatchId) == 1,
                "Concurrent confirmation must never exceed course capacity.");
            var capacityRecords = new[] { await Saved(5), await Saved(6) };
            Check(capacityRecords.Count(a => a.ApplicationStatus == "Confirmed Slot") == 1 && capacityRecords.Count(a => a.ApplicationStatus == "Approved" && !a.ConfirmedAt.HasValue) == 1,
                "A full course must leave the unsuccessful choice unchanged without a partial enrollment.");
            await Approve(3); var reoffered = await Saved(3);
            Check(reoffered.ConfirmationToken != expired.ConfirmationToken && (await Scan("/confirm-slot", expired.ConfirmationToken!)).Contains("invalid"),
                "A new offer must invalidate the old expired link.");
            Check(reoffered.ResponseDeadline > DateTime.Now && (await Scan("/confirm-slot", reoffered.ConfirmationToken!)).Contains("<form method=\"post\""),
                "An explicitly reapproved offer must receive a fresh, usable expiry.");
            // Older status updates could save confirmation without creating a pending account.
            var repairCourse = new Course { CourseName = "Confirmation recovery", Duration = "35 days", Status = "Available", SlotCapacity = 1 };
            db.Courses.Add(repairCourse); await db.SaveChangesAsync();
            var incomplete = new Applicant
            {
                FirstName = "Incomplete", LastName = "Confirmation", Email = "incomplete@example.invalid", ContactNumber = "09900000009",
                Address = "Synthetic verification only", Gender = "Male", Birthdate = new DateTime(2000, 1, 1),
                CourseId = repairCourse.CourseId, BatchId = batch.BatchId, ApplicationDate = DateTime.Now,
                ApplicationStatus = "Confirmed Slot", SlotResponse = "Confirmed", ConfirmedAt = DateTime.Now.AddDays(-2),
                ResponseDeadline = DateTime.Now.AddDays(-1), ConfirmationToken = Guid.NewGuid().ToString("N")
            };
            db.Applicants.Add(incomplete); await db.SaveChangesAsync();
            var originalConfirmation = await db.Applicants.AsNoTracking().Where(a => a.ApplicantId == incomplete.ApplicantId)
                .Select(a => a.ConfirmedAt).SingleAsync();
            Check((await Scan("/confirm-slot", incomplete.ConfirmationToken)).Contains("<form method=\"post\""),
                "A saved confirmation missing its student must offer completion instead of claiming success.");
            Check((await Submit("/confirm-slot", incomplete.ConfirmationToken)).Contains("Slot Confirmed Successfully"),
                "Confirming an incomplete saved decision must finish enrollment even after the original offer expires.");
            var recovered = await Data($"/api/activations?status=pending&batchId={batch.BatchId}");
            Check(recovered.EnumerateArray().Any(s => s.GetProperty("applicantId").GetInt32() == incomplete.ApplicantId),
                "Recovered confirmation must appear under Pending Activation in the original batch.");
            Check((await Submit("/confirm-slot", incomplete.ConfirmationToken)).Contains("Slot Confirmed Successfully")
                && await db.Students.CountAsync(s => s.ApplicantId == incomplete.ApplicantId) == 1
                && (await db.Applicants.AsNoTracking().SingleAsync(a => a.ApplicantId == incomplete.ApplicantId)).ConfirmedAt == originalConfirmation,
                "Recovery retries must preserve the original confirmation date and create only one account.");

            const string activationSubject = "Your ABEC Student Account Is Now Active";
            async Task<JsonElement> Activate(int studentId)
            {
                using var response = await admin.PostAsync($"/api/activations/{studentId}/activate", null);
                if (!response.IsSuccessStatusCode)
                    throw new Exception($"Activation verification failed (HTTP {(int)response.StatusCode}): {await response.Content.ReadAsStringAsync()}");
                using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
                return document.RootElement.Clone();
            }
            var firstStudent = await db.Students.AsNoTracking().SingleAsync(s => s.ApplicantId == records[0].ApplicantId);
            var activationCount = smtp.Messages.Count(m => m.Subject == activationSubject);
            var activations = await Task.WhenAll(Activate(firstStudent.StudentId), Activate(firstStudent.StudentId));
            Check(activations.All(a => a.GetProperty("success").GetBoolean()), "Concurrent activation requests succeed without duplicate transitions.");
            Check(smtp.Messages.Count(m => m.Subject == activationSubject) == activationCount + 1, "Pending-to-Active sends one email, even for concurrent clicks.");
            var activationMessage = smtp.Messages.Single(m => m.Subject == activationSubject && m.To.Mailboxes.Single().Address == records[0].Email);
            var savedFirstStudent = await db.Students.AsNoTracking().SingleAsync(s => s.StudentId == firstStudent.StudentId);
            Check(activationMessage.From.Mailboxes.Single().Name == "ABEC" && activationMessage.HtmlBody!.Contains(WebUtility.HtmlEncode(records[0].FullName)),
                "Activation email is from ABEC and addresses the intended student by name.");
            Check(activationMessage.HtmlBody!.Contains(AppSettings.DefaultProductionBaseUrl + "/Views/Home/LoginPage.html") && activationMessage.HtmlBody.Contains(">Student Portal</a>")
                && activationMessage.HtmlBody.Contains("ready to use"), "Activation email confirms readiness and links to Student Portal using the configured app URL.");
            Check(activationMessage.HtmlBody!.Contains(savedFirstStudent.SecurityPin)
                && activations.All(a => a.GetProperty("data").GetProperty("securityPin").GetString() == savedFirstStudent.SecurityPin),
                "Email contains the activated student's persisted PIN, including any standardized PIN change.");
            var beforeInvalid = smtp.Messages.Count;
            Check(!(await Activate(int.MaxValue)).GetProperty("success").GetBoolean() && smtp.Messages.Count == beforeInvalid, "Failed activation must not send an email.");
            using (var unauthorized = await browser.PostAsync($"/api/activations/{firstStudent.StudentId}/activate", null))
                Check(unauthorized.StatusCode == HttpStatusCode.Unauthorized && smtp.Messages.Count == beforeInvalid, "Unauthenticated activation must not send an email.");
            await Activate(firstStudent.StudentId);
            Check(smtp.Messages.Count == beforeInvalid, "An already Active account does not send another activation email.");

            // Exercise bulk activation with two different students and duplicate selections.
            Check((await Submit("/confirm-slot", retried.ConfirmationToken!)).Contains("Slot Confirmed Successfully"), "Second activation test student confirms their own offer.");
            var bulkCourse = new Course { CourseName = "Activation bulk verification", Duration = "35 days", Status = "Available", SlotCapacity = 2 };
            db.Courses.Add(bulkCourse); await db.SaveChangesAsync();
            await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE applicants SET course_id={bulkCourse.CourseId} WHERE applicant_id={records[7].ApplicantId}");
            await Approve(7); var bulkOffer = await Saved(7);
            Check((await Submit("/confirm-slot", bulkOffer.ConfirmationToken!)).Contains("Slot Confirmed Successfully"), "Third activation test student confirms their own offer.");
            var bulkStudents = await db.Students.AsNoTracking().Where(s => s.ApplicantId == records[2].ApplicantId || s.ApplicantId == records[7].ApplicantId).ToListAsync();
            var beforeBulk = smtp.Messages.Count(m => m.Subject == activationSubject);
            using (var bulkResponse = await admin.PostAsync("/api/activations/bulk-status", Json(new
                { ids = new[] { bulkStudents[0].StudentId, bulkStudents[1].StudentId, bulkStudents[0].StudentId, firstStudent.StudentId }, status = "Active" })))
            {
                bulkResponse.EnsureSuccessStatusCode();
                Check(smtp.Messages.Count(m => m.Subject == activationSubject) == beforeBulk + 2, "Bulk activation sends one email for each newly activated student, ignoring duplicate IDs and already Active accounts.");
            }
            foreach (var bulkStudent in bulkStudents)
            {
                var savedBulk = await db.Students.AsNoTracking().Include(s => s.Applicant).SingleAsync(s => s.StudentId == bulkStudent.StudentId);
                var ownEmail = smtp.Messages.Single(m => m.Subject == activationSubject && m.To.Mailboxes.Single().Address == savedBulk.Applicant!.Email);
                Check(ownEmail.HtmlBody!.Contains(savedBulk.SecurityPin) && !ownEmail.HtmlBody.Contains(savedFirstStudent.SecurityPin),
                    "Each bulk activation email contains only its own student's PIN.");
                using var loginResponse = await browser.PostAsync("/api/auth/student-login", Json(new { email = savedBulk.Applicant!.Email, securityPin = savedBulk.SecurityPin }));
                using var loginDocument = JsonDocument.Parse(await loginResponse.Content.ReadAsStringAsync());
                Check(loginDocument.RootElement.GetProperty("success").GetBoolean(), "The PIN sent in the email can actually sign in to the student's account.");
            }
            Check(activationObservations.Count == 3 && activationObservations.All(value => value), "Every activation email is received only after a separate database connection sees Active with the exact recipient, name and PIN.");

            var failedStudent = await db.Students.AsNoTracking().SingleAsync(s => s.ApplicantId == lastSlotA.ApplicantId || s.ApplicantId == lastSlotB.ApplicantId);
            smtp.RejectNext = true;
            var failedActivation = await Activate(failedStudent.StudentId);
            Check(failedActivation.GetProperty("success").GetBoolean() && failedActivation.GetProperty("message").GetString()!.StartsWith("EMAIL_NOT_SENT:")
                && (await db.Students.AsNoTracking().SingleAsync(s => s.StudentId == failedStudent.StudentId)).AccountStatus == "Active",
                "SMTP failure is reported without rolling back the successful activation.");
            var beforeFailureReplay = smtp.Messages.Count;
            await Activate(failedStudent.StudentId);
            Check(smtp.Messages.Count == beforeFailureReplay, "Retrying the activation request cannot duplicate an already completed transition.");
            if (Environment.GetEnvironmentVariable("ABEC_SLOT_BROWSER_CHECKS") == "1")
                await RunEmailBrowserChecks(db, admin, smtp, origin, batch.BatchId, https);
            Console.WriteLine($"PASS: {checks} end-to-end approval, slot response and activation-email checks using HTTPS, isolated MySQL and a loopback SMTP inbox. No external email sent.");
        }
        finally
        {
            if (!process.HasExited) { process.Kill(true); await process.WaitForExitAsync(); }
            Directory.CreateDirectory("artifacts/slot-workflow");
            await File.WriteAllTextAsync("artifacts/slot-workflow/server.log", (await stdout) + (await stderr));
        }
    }

    private static async Task RunEmailBrowserChecks(ApplicationDbContext db, HttpClient admin, MailSink smtp, string origin, int batchId, VerificationHttps https)
    {
        var course = new Course { CourseName = "Email browser verification", Duration = "35 days", SlotCapacity = 5, Status = "Available" };
        db.Courses.Add(course); await db.SaveChangesAsync();
        var fixtures = new List<object>();
        var people = new List<Applicant>();
        for (var index = 0; index < 5; index++)
        {
            var person = new Applicant { FirstName = "Email" + index, LastName = "Browser", Email = $"emailbrowser{index}@example.invalid", ContactNumber = "0988888800" + index,
                Gender = "Female", Birthdate = new DateTime(2000, 1, 1), Address = "Synthetic verification only", CourseId = course.CourseId, BatchId = batchId,
                ApplicationDate = DateTime.Now, ApplicationStatus = "Pending" };
            db.Applicants.Add(person); await db.SaveChangesAsync(); people.Add(person);
            using var response = await admin.PutAsync($"/api/applicants/{person.ApplicantId}/status", Json(new { status = "Approved" }));
            response.EnsureSuccessStatusCode();
            var email = smtp.Messages.Single(m => m.To.Mailboxes.Single().Address == person.Email);
            fixtures.Add(new { applicantId = person.ApplicantId, name = person.FullName, html = email.HtmlBody, action = index % 2 == 0 ? "Confirm Slot" : "Reject Slot", width = index < 2 ? (index == 0 ? 320 : 390) : 1366 });
        }
        var expired = people[4];
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE applicants SET response_deadline={DateTime.Now.AddMinutes(-1)} WHERE applicant_id={expired.ApplicantId}");
        var start = new ProcessStartInfo("node") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true };
        start.ArgumentList.Add(Path.GetFullPath("scripts/check-slot-email-browser.cjs"));
        start.Environment["ABEC_VERIFICATION_DLL"] = Path.Combine(AppContext.BaseDirectory, "BatchVerification.dll");
        start.Environment["NODE_EXTRA_CA_CERTS"] = https.CertificatePath;
        using var browser = Process.Start(start)!;
        var stdout = browser.StandardOutput.ReadToEndAsync(); var stderr = browser.StandardError.ReadToEndAsync();
        await browser.StandardInput.WriteAsync(JsonSerializer.Serialize(new { origin, publicOrigin = AppSettings.DefaultProductionBaseUrl, fixtures, appSpki = https.Spki, credentials = new { username = VerificationAccounts.AdminUsername, password = VerificationAccounts.Password } }));
        browser.StandardInput.Close();
        await browser.WaitForExitAsync();
        if (browser.ExitCode != 0) throw new Exception("Captured email browser checks failed: " + await stderr + await stdout);
        Console.Write(await stdout);
        for (var index = 0; index < 4; index++)
        {
            var saved = await db.Applicants.AsNoTracking().SingleAsync(a => a.ApplicantId == people[index].ApplicantId);
            if (saved.ApplicationStatus != (index % 2 == 0 ? "Confirmed Slot" : "Rejected")
                || await db.Students.CountAsync(s => s.ApplicantId == saved.ApplicantId) != (index % 2 == 0 ? 1 : 0))
                throw new Exception("Browser email choice changed the wrong applicant or duplicated enrollment.");
        }
        if (await db.Students.AnyAsync(s => s.ApplicantId == expired.ApplicantId)) throw new Exception("An expired email link enrolled an applicant.");
    }

    private static StringContent Json(object value) => new(JsonSerializer.Serialize(value), Encoding.UTF8, "application/json");
    private static int FreePort() { var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start(); var port = ((IPEndPoint)listener.LocalEndpoint).Port; listener.Stop(); return port; }

    private sealed class MailSink : IAsyncDisposable
    {
        private readonly TcpListener listener = new(IPAddress.Loopback, 0);
        private readonly CancellationTokenSource stop = new();
        private readonly Task accept;
        public ConcurrentQueue<MimeMessage> Messages { get; } = new();
        public Func<MimeMessage, Task>? OnMessage { get; set; }
        public volatile bool RejectNext;
        public int Port => ((IPEndPoint)listener.LocalEndpoint).Port;
        public MailSink() { listener.Start(); accept = Accept(); }
        private async Task Accept()
        {
            try { while (!stop.IsCancellationRequested) { var client = await listener.AcceptTcpClientAsync(stop.Token); _ = Receive(client); } }
            catch (OperationCanceledException) { }
        }
        private async Task Receive(TcpClient client)
        {
            using (client)
            {
                using var stream = client.GetStream();
                using var reader = new StreamReader(stream, Encoding.UTF8);
                using var writer = new StreamWriter(stream, Encoding.ASCII) { AutoFlush = true, NewLine = "\r\n" };
                await writer.WriteLineAsync("220 loopback SMTP verification");
                while (await reader.ReadLineAsync() is { } line)
                {
                    if (line.StartsWith("EHLO")) await writer.WriteLineAsync("250-localhost\r\n250 AUTH PLAIN");
                    else if (line.StartsWith("AUTH")) await writer.WriteLineAsync("235 Authentication accepted");
                    else if (line == "DATA")
                    {
                        await writer.WriteLineAsync("354 Send message");
                        var body = new StringBuilder();
                        while (await reader.ReadLineAsync() is { } part && part != ".") body.Append(part.StartsWith("..") ? part[1..] : part).Append("\r\n");
                        if (RejectNext) { RejectNext = false; await writer.WriteLineAsync("550 Verification delivery failure"); }
                        else
                        {
                            using var bytes = new MemoryStream(Encoding.UTF8.GetBytes(body.ToString()));
                            var message = await MimeMessage.LoadAsync(bytes);
                            if (OnMessage is not null) await OnMessage(message);
                            Messages.Enqueue(message);
                            await writer.WriteLineAsync("250 Message accepted");
                        }
                    }
                    else if (line == "QUIT") { await writer.WriteLineAsync("221 Bye"); break; }
                    else await writer.WriteLineAsync("250 OK");
                }
            }
        }
        public async ValueTask DisposeAsync() { stop.Cancel(); listener.Stop(); await accept; stop.Dispose(); }
    }
}
