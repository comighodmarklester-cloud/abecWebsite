using System.Security.Claims;
using System.Text.Json;
using ABEC_System.Constants;
using ABEC_System.Data;
using ABEC_System.DTOs;
using ABEC_System.Models;
using ABEC_System.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

internal static class RegistrationDocumentChecks
{
    public static async Task Run(ApplicationDbContext db, ApplicantService service, Applicant original, Student student, Admin admin, TestEnvironment env)
    {
        var checks = 0;
        void Check(bool ok, string label) { if (!ok) throw new Exception(label); checks++; Console.WriteLine("PASS " + label); }
        var storage = new ApplicantRegistrationStorageService(db, env);
        var types = SystemConstants.RegistrationChoices.CredentialDocumentTypes;
        IFormFile Pdf(string name = "upload.pdf", string bytes = "%PDF-1.4\nSynthetic registration document\n%%EOF") =>
            new FormFile(new MemoryStream(System.Text.Encoding.ASCII.GetBytes(bytes)), 0, bytes.Length, "file", name)
            { Headers = new HeaderDictionary(), ContentType = "application/pdf" };
        List<IFormFile> Files(params string[] labels) => labels.Select(t => Pdf(t + ".pdf")).ToList();
        EnrollApplicantDto Dto(string suffix, string phone) => new() {
            FirstName = "Registration", LastName = "Verification", Email = suffix + "@example.invalid", ContactNumber = phone,
            CourseId = original.CourseId, Province = "Albay", CityMunicipality = "Legazpi", Barangay = "Test", StreetDetails = "Test Street",
            Gender = "Female", Birthdate = DateTime.Today.AddYears(-25), Age = 25, PrivacyNoticeAcknowledged = true,
            SchoolName = "N/A", SchoolAddress = "N/A", QualificationType = SystemConstants.RegistrationChoices.QualificationTypes[0],
            ApplicantClassification = SystemConstants.RegistrationChoices.Classifications[0], CivilStatus = "Single", BirthPlace = "Legazpi",
            Telephone = "N/A", Fax = "N/A", EducationLevel = SystemConstants.RegistrationChoices.EducationLevels[0],
            EmploymentStatus = SystemConstants.RegistrationChoices.EmploymentStatuses[0], AddressDistrict = "N/A",
            AddressRegion = SystemConstants.RegistrationChoices.Regions[0].Name, ZipCode = "4500", IdentityIdType = "Passport"
        };
        var before = await db.Applicants.CountAsync();
        var rejected = Dto("missing", "09191234560");
        rejected.CredentialDocumentTypes = types.Where(t => t != "Form138").ToList();
        Check(!(await service.EnrollWithDocumentsAsync(rejected, Files(rejected.CredentialDocumentTypes.ToArray()), Pdf())).Success,
            "Unmarked missing documents are rejected by backend before creating an application.");
        Check(await db.Applicants.CountAsync() == before, "Rejected documents leave no partial application.");
        Check(await storage.ValidateSubmissionAsync([], Pdf(), [], ["Unknown"]) is not null, "Unknown follow-up types are rejected.");
        Check(await storage.ValidateSubmissionAsync(Files("TOR", "TOR"), Pdf(), ["TOR", "TOR"], types) is not null, "Duplicate upload types are rejected.");
        Check(await storage.ValidateSubmissionAsync([Pdf("BirthCertificate.pdf", "fake")], Pdf(), ["BirthCertificate"], types) is not null,
            "Follow-up flags cannot bypass PDF signature validation.");
        Check(await storage.ValidateSubmissionAsync([], null, [], types) is not null, "Identity upload remains required.");

        var dto = Dto("pending", "09191234561");
        dto.CredentialDocumentTypes = types.Where(t => t != "Form138").ToList();
        dto.FollowUpDocumentTypes = ["Form138"];
        var enrolled = await service.EnrollWithDocumentsAsync(dto, Files(dto.CredentialDocumentTypes.ToArray()), Pdf("identity.pdf"));
        Check(enrolled.Success, "Application submits with four PDFs including PSA and Form 138 marked for follow up.");
        var id = enrolled.Data!.ApplicantId;
        var docs = (await storage.ListForApplicantAsync(id)).Data!;
        Check(docs.Count == 6 && docs.Count(d => d.IsFollowUp) == 1, "Exactly five credentials plus identity are stored without duplication.");
        var pending = docs.Single(d => d.DocumentLabel == "Form138");
        Check(pending.IsFollowUp && pending.SizeBytes == 0 && pending.OriginalFileName == "", "Pending record has a durable status and no fictitious file.");
        Check((await storage.ListAllAsync(batchId: original.BatchId)).Data!.Any(d => d.DocumentId == pending.DocumentId && d.IsFollowUp),
            "Admin document list returns the saved pending status.");
        Check((await storage.OpenDocumentAsync(id, pending.DocumentId)).Stream is null, "Pending records do not provide a download.");
        var psa = docs.Single(d => d.DocumentLabel == "BirthCertificate");
        var opened = await storage.OpenDocumentAsync(id, psa.DocumentId);
        Check(!psa.IsFollowUp && psa.OriginalFileName == "BirthCertificate.pdf" && opened.Stream is not null, "PSA uses private storage and the existing download workflow.");
        if (opened.Stream is not null) await opened.Stream.DisposeAsync();
        Check(!(await storage.UploadFollowUpAsync(original.ApplicantId, pending.DocumentId, Pdf())).Success, "A document cannot be uploaded into an unrelated applicant record.");
        Check(!(await storage.UploadFollowUpAsync(id, pending.DocumentId, Pdf("invalid.pdf", "invalid"))).Success, "Invalid follow-up PDF is rejected without clearing pending status.");
        Check((await storage.ListForApplicantAsync(id)).Data!.Single(d => d.DocumentId == pending.DocumentId).IsFollowUp, "Rejected follow-up retains the saved pending status.");
        Check((await storage.UploadFollowUpAsync(id, pending.DocumentId, Pdf("late.pdf"))).Success, "Admin can upload the pending document later.");
        docs = (await storage.ListForApplicantAsync(id)).Data!;
        Check(docs.Count == 6 && !docs.Single(d => d.DocumentId == pending.DocumentId).IsFollowUp, "Later upload updates the same document record to uploaded.");
        Check(!(await storage.UploadFollowUpAsync(id, pending.DocumentId, Pdf())).Success, "Repeated upload cannot create duplicates or replace a submitted file.");
        Check(!(await storage.SaveEnrollmentDocumentsAsync(id, Files(types), Pdf(), types)).Success, "Repeated enrollment storage cannot duplicate saved documents.");

        var complete = Dto("complete", "09191234562"); complete.CredentialDocumentTypes = types.ToList(); complete.FollowUpDocumentTypes = ["BirthCertificate"];
        var completed = await service.EnrollWithDocumentsAsync(complete, Files(types), Pdf());
        Check(completed.Success && (await storage.ListForApplicantAsync(completed.Data!.ApplicantId)).Data!.All(d => !d.IsFollowUp),
            "A real upload overrides a stale follow-up flag, including PSA.");
        var allPending = Dto("allpending", "09191234563"); allPending.FollowUpDocumentTypes = types.ToList();
        var all = await service.EnrollWithDocumentsAsync(allPending, [], Pdf());
        Check(all.Success && (await storage.ListForApplicantAsync(all.Data!.ApplicantId)).Data!.Count(d => d.IsFollowUp) == 5,
            "Each credential can be explicitly pending while identity remains uploaded.");

        foreach (var role in new[] { "Admin", "Student", "Anonymous" })
        {
            var http = new DefaultHttpContext();
            if (role != "Anonymous") http.User = new ClaimsPrincipal(new ClaimsIdentity([
                new Claim(ClaimTypes.NameIdentifier, (role == "Admin" ? admin.AdminId : student.StudentId).ToString()), new Claim(ClaimTypes.Role, role)], "Fixture"));
            var route = new RouteData(); route.Values["controller"] = "Applicant"; route.Values["action"] = "UploadFollowUp";
            var context = new AuthorizationFilterContext(new ActionContext(http, route, new ActionDescriptor()), []);
            await new BatchAccessFilter(db).OnAuthorizationAsync(context);
            Check((context.Result is null) == (role == "Admin"), role + " follow-up upload access follows existing admin authorization.");
        }
        var originalSnapshot = JsonSerializer.Serialize(await db.Applicants.AsNoTracking().SingleAsync(a => a.ApplicantId == original.ApplicantId));
        var savedDocs = JsonSerializer.Serialize(await db.ApplicantRegistrationDocuments.AsNoTracking().OrderBy(d => d.DocumentId).ToListAsync());
        using (var bootstrap = new ServiceCollection().AddDbContext<ApplicationDbContext>(o => o.UseMySql(db.Database.GetConnectionString(), new MySqlServerVersion(new Version(8, 0, 36)))).BuildServiceProvider())
        { await DbSeeder.SeedAsync(bootstrap); await DbSeeder.SeedAsync(bootstrap); }
        Check(JsonSerializer.Serialize(await db.ApplicantRegistrationDocuments.AsNoTracking().OrderBy(d => d.DocumentId).ToListAsync()) == savedDocs,
            "Repeated startup preserves all uploaded and pending registration records.");
        Check(JsonSerializer.Serialize(await db.Applicants.AsNoTracking().SingleAsync(a => a.ApplicantId == original.ApplicantId)) == originalSnapshot,
            "Existing enrollment and personal details remain unchanged.");
        var httpDto = Dto("http-registration", "09191234564");
        httpDto.CredentialDocumentTypes = types.Where(t => t != "Form138").ToList(); httpDto.FollowUpDocumentTypes = ["Form138"];
        await VerifyHttp(httpDto);

        var archivedStudent = new Student { ApplicantId = all.Data!.ApplicantId, BatchId = original.BatchId!.Value,
            SecurityPin = "ABECRV0001", AccountStatus = "Active", CreatedAt = DateTime.Now };
        db.Students.Add(archivedStudent); await db.SaveChangesAsync();
        db.Archives.Add(new Archive { StudentId = archivedStudent.StudentId, ArchiveReason = "Completed", ArchiveDate = DateTime.Now }); await db.SaveChangesAsync();
        var lastPending = (await storage.ListForApplicantAsync(all.Data!.ApplicantId)).Data!.First(d => d.IsFollowUp);
        Check(!(await storage.UploadFollowUpAsync(all.Data.ApplicantId, lastPending.DocumentId, Pdf())).Success,
            "Archived registration records retain existing write protection.");
        var batch = await db.Batches.FindAsync(original.BatchId); batch!.Status = "Completed"; batch.CompletedAt = DateTime.Now; await db.SaveChangesAsync();
        var blocked = false;
        try { await storage.UploadFollowUpAsync(all.Data.ApplicantId, lastPending.DocumentId, Pdf()); } catch (BatchIntegrityException) { blocked = true; }
        Check(blocked, "Completed-batch registration records retain existing write protection.");
        var applicationPdf = new PdfService(env).GenerateApplicationFormPdf(original);
        await File.WriteAllBytesAsync("artifacts/registration-update/application-checklist.pdf", applicationPdf);
        Check(applicationPdf.AsSpan().StartsWith("%PDF-"u8), "Updated application checklist generates a valid PDF for visual verification.");
        Console.WriteLine($"PASS {checks} registration document checks (isolated database, synthetic files and email).");

        async Task VerifyHttp(EnrollApplicantDto request)
        {
            Directory.CreateDirectory(Path.Combine(env.ContentRootPath, "Views"));
            var listener = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, 0); listener.Start();
            var port = ((System.Net.IPEndPoint)listener.LocalEndpoint).Port; listener.Stop();
            using var https = new VerificationHttps(env.ContentRootPath);
            var start = new System.Diagnostics.ProcessStartInfo("dotnet") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
            foreach (var arg in new[] { Path.Combine(AppContext.BaseDirectory, "ABEC System.dll"), "--urls", $"https://127.0.0.1:{port}", "--contentRoot", env.ContentRootPath, "--webroot", Path.Combine(Directory.GetCurrentDirectory(), "wwwroot") }) start.ArgumentList.Add(arg);
            start.Environment["ConnectionStrings__DefaultConnection"] = db.Database.GetConnectionString();
            start.Environment["ASPNETCORE_ENVIRONMENT"] = "Production"; start.Environment["Email__Enabled"] = "false";
            start.Environment["Logging__LogLevel__Default"] = "Warning";
            https.Configure(start);
            using var process = System.Diagnostics.Process.Start(start)!;
            var stdout = process.StandardOutput.ReadToEndAsync(); var stderr = process.StandardError.ReadToEndAsync();
            try
            {
                using var anonymous = https.Client(new Uri($"https://127.0.0.1:{port}"));
                var ready = false;
                for (var attempt = 0; attempt < 40; attempt++)
                {
                    if (process.HasExited)
                    {
                        Directory.CreateDirectory("artifacts/registration-update");
                        await File.WriteAllTextAsync("artifacts/registration-update/http-startup.private.log", await stdout + await stderr);
                        throw new Exception("Isolated HTTP server exited; inspect private startup log.");
                    }
                    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(1));
                    try { using var health = await anonymous.GetAsync("/api/health", timeout.Token); if (health.IsSuccessStatusCode) { ready = true; break; } }
                    catch (HttpRequestException) { }
                    catch (OperationCanceledException) { }
                    await Task.Delay(250);
                }
                Check(ready, "Isolated HTTPS application starts with the additive document schema.");
                MultipartFormDataContent UploadBody() { var form = new MultipartFormDataContent(); form.Add(new ByteArrayContent("%PDF-1.4\nSynthetic HTTP upload\n%%EOF"u8.ToArray()), "file", "late.pdf"); return form; }
                using var form = new MultipartFormDataContent();
                form.Add(new StringContent(JsonSerializer.Serialize(request)), "data");
                foreach (var label in request.CredentialDocumentTypes!) form.Add(new ByteArrayContent("%PDF-1.4\nSynthetic HTTP registration\n%%EOF"u8.ToArray()), "credentialFiles", label + ".pdf");
                form.Add(new ByteArrayContent("%PDF-1.4\nSynthetic identity\n%%EOF"u8.ToArray()), "identityFile", "identity.pdf");
                using var submitted = await anonymous.PostAsync("/api/applicants/enroll/files", form);
                using var result = JsonDocument.Parse(await submitted.Content.ReadAsStringAsync());
                Check(submitted.IsSuccessStatusCode && result.RootElement.GetProperty("success").GetBoolean(), "Real multipart enrollment accepts PSA and explicit Form 138 follow up.");
                var applicantId = result.RootElement.GetProperty("data").GetProperty("applicantId").GetInt32();
                using var adminClient = https.Client(anonymous.BaseAddress!);
                using var login = await adminClient.PostAsync("/api/auth/admin-login", new StringContent(JsonSerializer.Serialize(new { username = VerificationAccounts.AdminUsername, password = VerificationAccounts.Password }), System.Text.Encoding.UTF8, "application/json"));
                Check(login.IsSuccessStatusCode, "Admin authenticates using the existing server session workflow.");
                using var list = JsonDocument.Parse(await adminClient.GetStringAsync($"/api/applicants/{applicantId}/registration-documents"));
                var pendingDoc = list.RootElement.GetProperty("data").EnumerateArray().Single(d => d.GetProperty("documentLabel").GetString() == "Form138");
                var documentId = pendingDoc.GetProperty("documentId").GetInt32();
                Check(pendingDoc.GetProperty("isFollowUp").GetBoolean(), "Real admin API exposes pending status saved by public multipart enrollment.");
                var url = $"/api/applicants/{applicantId}/registration-documents/{documentId}/file";
                using (var body = UploadBody()) using (var denied = await anonymous.PostAsync(url, body))
                    Check(denied.StatusCode == System.Net.HttpStatusCode.Unauthorized, "Anonymous follow-up upload is denied over HTTP.");
                using (var body = UploadBody()) using (var upload = await adminClient.PostAsync(url, body))
                {
                    using var payload = JsonDocument.Parse(await upload.Content.ReadAsStringAsync());
                    Check(upload.IsSuccessStatusCode && payload.RootElement.GetProperty("success").GetBoolean(),
                        "Authenticated admin multipart upload binds and updates the pending record. " + (int)upload.StatusCode + " " +
                        (payload.RootElement.TryGetProperty("message", out var failure) ? failure.GetString() : "No message"));
                }
                using var refreshed = JsonDocument.Parse(await adminClient.GetStringAsync($"/api/applicants/{applicantId}/registration-documents"));
                Check(!refreshed.RootElement.GetProperty("data").EnumerateArray().Single(d => d.GetProperty("documentId").GetInt32() == documentId).GetProperty("isFollowUp").GetBoolean(), "HTTP refresh returns uploaded status without duplicate document IDs.");
                using var download = await adminClient.GetAsync($"/api/applicants/{applicantId}/registration-documents/{documentId}/download");
                Check(download.IsSuccessStatusCode && (await download.Content.ReadAsByteArrayAsync()).AsSpan().StartsWith("%PDF-"u8), "Uploaded follow-up PDF is downloadable through the existing authorized route.");
            }
            finally {
                if (!process.HasExited) { process.Kill(true); await process.WaitForExitAsync(); }
                await Task.WhenAll(stdout, stderr);
                Directory.CreateDirectory("artifacts/registration-update");
                await File.WriteAllTextAsync("artifacts/registration-update/http-test.private.log", await stdout + await stderr);
            }
        }
    }
}
