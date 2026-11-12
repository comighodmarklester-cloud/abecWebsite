using System.Security.Claims;
using System.Text.Json;
using ABEC_System.Constants;
using ABEC_System.Data;
using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using ABEC_System.Models;
using ABEC_System.Options;
using ABEC_System.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;
using MySqlConnector;

if (args.Contains("--create-browser-tls")) { BrowserFixtureTls.Write(); return; }
if (args.Contains("--code-security-only")) { await CodeSecurityChecks.Run(); return; }
if (args.Contains("--public-url-only")) { PublicUrlChecks.Run(); return; }
if (args.Contains("--archive-statistics-only")) { await ArchiveStatisticsChecks.Run(); return; }
if (args.Contains("--report-export-only")) { await ReportExportChecks.Run(); return; }

var config = JsonDocument.Parse(File.ReadAllText("appsettings.json"));
var connection = config.RootElement.GetProperty("ConnectionStrings").GetProperty("DefaultConnection").GetString()!;
var inspected = new MySqlConnectionStringBuilder(connection);
if (inspected.Server is not ("localhost" or "127.0.0.1") || inspected.Database != "abec_system") throw new Exception("Tests require the known local source; no live changes are permitted.");
if (args.Contains("--archive-categories-readonly"))
{
    await using var categoryDb = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
        .UseMySql(connection, ServerVersion.AutoDetect(connection)).Options);
    await ArchiveStatisticsChecks.RunReadOnly(categoryDb);
    return;
}
await using var source = new MySqlConnection(connection);
await source.OpenAsync();
foreach (var sql in new[] {
 "SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('applicants','batches') GROUP BY TABLE_NAME,INDEX_NAME,NON_UNIQUE",
 "SELECT 'unassigned_applicants', COUNT(*) FROM applicants WHERE batch_id IS NULL UNION ALL SELECT 'mismatched_student_batches', COUNT(*) FROM students s JOIN applicants a ON a.applicant_id=s.applicant_id WHERE a.batch_id IS NULL OR s.batch_id<>a.batch_id",
 "SELECT status, COUNT(*) FROM batches GROUP BY status"
}) {
 await using var cmd = new MySqlCommand(sql, source);
 await using var r = await cmd.ExecuteReaderAsync();
 while (await r.ReadAsync()) Console.WriteLine(string.Join(" | ", Enumerable.Range(0,r.FieldCount).Select(i=>r.GetValue(i))));
}
if (args.Contains("--inspect")) return;
var testName = "abec_batch_verify_" + Guid.NewGuid().ToString("N");
await using (var create = new MySqlCommand($"CREATE DATABASE `{testName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci", source)) await create.ExecuteNonQueryAsync();
try
{
 var testConnection = new MySqlConnectionStringBuilder(connection) { Database = testName }.ConnectionString;
 var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseMySql(testConnection, ServerVersion.AutoDetect(testConnection)).Options;
 await using var db = new ApplicationDbContext(options);
 // Clone schema only: no applicant, student, account, or document data is copied.
 var tableNames = new List<string>();
 await using (var tables = new MySqlCommand("SHOW TABLES", source))
 await using (var reader = await tables.ExecuteReaderAsync())
   while (await reader.ReadAsync()) tableNames.Add(reader.GetString(0));
 await using (var target = new MySqlConnection(testConnection)) {
  await target.OpenAsync();
  await using(var disable = new MySqlCommand("SET FOREIGN_KEY_CHECKS=0",target)) await disable.ExecuteNonQueryAsync();
  foreach(var table in tableNames) {
   await using var show=new MySqlCommand("SHOW CREATE TABLE \x60"+table.Replace("\x60","\x60\x60")+"\x60",source);
   string ddl; await using(var reader=await show.ExecuteReaderAsync()) {await reader.ReadAsync();ddl=reader.GetString(1);}
   await using var createTable=new MySqlCommand(ddl,target);await createTable.ExecuteNonQueryAsync();
  }
  await using(var enable=new MySqlCommand("SET FOREIGN_KEY_CHECKS=1",target)) await enable.ExecuteNonQueryAsync();
 }
 await db.Database.OpenConnectionAsync();
 foreach (var sql in BatchLifecycleUpgrade.Statements) await db.Database.ExecuteSqlRawAsync(sql);
 foreach (var sql in BatchLifecycleUpgrade.Statements) await db.Database.ExecuteSqlRawAsync(sql); // upgrade must be repeatable
 await db.Database.CloseConnectionAsync();
 var filter = new BatchWriteFilter(db);

 var notices = new NotificationService(db);
 var env = new TestEnvironment { ContentRootPath = Path.Combine(Directory.GetCurrentDirectory(), "App_Data", "batch-verification-files", testName) };
 var email = new TestEmail();
 var pdf = new TestPdf();
 var accessor = new HttpContextAccessor { HttpContext = new DefaultHttpContext() };
 var archiveService = new ArchiveService(db, notices);
 var applicantService = new ApplicantService(db, notices, email, pdf, new TestOptions(), accessor, new ApplicantRegistrationStorageService(db, env));
 var activationService = new ActivationService(db, notices, pdf, archiveService, email, new TestOptions(), env);
 var requests = new DocumentRequestService(db, notices, email, env);
 var courseDocuments = new CourseDocumentService(db, notices, env);
 var batches = new BatchService(db);
 var snapshots = new BatchDocumentService(batches, applicantService, activationService, requests, archiveService, db);
 var course = new Course { CourseName = "Computer Systems Servicing NC II", Duration = "35 days", Status = "Available", SlotCapacity = 2 };
 var admin = new Admin { Username = VerificationAccounts.AdminUsername, Password = BCrypt.Net.BCrypt.HashPassword(VerificationAccounts.Password), CreatedAt = DateTime.Now };
 db.AddRange(course, admin); await db.SaveChangesAsync();
 var adminUser = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier,admin.AdminId.ToString()), new Claim(ClaimTypes.Role,"Admin") },"StudentSession"));

 var first = await batches.CreateAsync(new CreateBatchDto { BatchName = "Batch2026-101", StartDate = DateTime.Today.AddDays(1), EndDate = DateTime.Today.AddDays(60), ActivateNow = true, ConfirmSwitch = true });
 Check(first.Success, "create and activate first batch");
 var oldId = first.Data!.BatchId;
 var firstEntity = await db.Batches.FindAsync(oldId); firstEntity!.StartDate = DateTime.Today.AddYears(-1); firstEntity.EndDate = DateTime.Today.AddMonths(-6); await db.SaveChangesAsync();
 var oldApplicant = await Register("batch.verify@example.com", "09123456789");
 oldApplicant.ApplicationStatus = "Confirmed Slot"; oldApplicant.ConfirmedAt = DateTime.Now; await db.SaveChangesAsync();
 var originalPin = $"ABECHN{oldApplicant.Birthdate.Day:00}89{oldApplicant.ApplicationDate.Day:00}";
 var oldStudent = new Student { ApplicantId = oldApplicant.ApplicantId, BatchId = oldId, SecurityPin = originalPin, AccountStatus = "Active", CreatedAt = DateTime.Now };
 db.Students.Add(oldStudent); await db.SaveChangesAsync();
 if (args.Contains("--strict-security-only"))
 {
  await StrictSecurityChecks.Run(db, oldApplicant, oldStudent, admin, env);
  return;
 }
 if (args.Contains("--feature-updates-only"))
 {
  await FeatureUpdateChecks.Run(db, applicantService);
  return;
 }
 if (args.Contains("--slot-workflow-only"))
 {
  await SlotWorkflowChecks.Run(db, testConnection, env);
  return;
 }
 if (args.Contains("--archive-workflow-only"))
 {
  await ArchiveWorkflowChecks.Run(db, oldStudent.StudentId, course.CourseId, oldId);
  return;
 }
 var trainingSchedule = new CourseSchedule { BatchId=oldId, CourseId=course.CourseId, ScheduleDate=DateTime.Today.AddDays(1), StartTime=TimeSpan.FromHours(8), EndTime=TimeSpan.FromHours(16), Room="Verification room", Trainer="Verification trainer", TrainerAssignments="", Status="Active" };
 db.CourseSchedules.Add(trainingSchedule); await db.SaveChangesAsync();
 var activePortal = new StudentPortalService(db,requests,notices);
 Check((await activePortal.GetProfileAsync(oldStudent.StudentId)).Data!.CanViewTrainingSchedule && (await activePortal.GetScheduleAsync(oldStudent.StudentId)).Data!.Count==1,"active student retains own batch schedule including legacy blank trainer assignments");
 Check(!(await requests.CreateAsync(oldStudent.StudentId,new() {DocumentType="Payment Receipt",Reason="Verification"})).Success,"unpaid student cannot request receipt even in an active batch");
 Check(!(await requests.CreateAsync(oldStudent.StudentId,new() {DocumentType="Certificate of Completion",Reason="Verification"})).Success,"elapsed batch dates do not prove individual completion");
 var earlyNc = await requests.CreateAsync(oldStudent.StudentId,new() {DocumentType="National Certificate (TESDA)",Reason="Verification"});
 Check(earlyNc.Success,"unreleased TESDA certificate can be requested independently of other eligibility");
 Check((await new StudentDocumentCatalog(db).VerifyAsync(oldStudent.StudentId,admin.AdminId,new() {FeesPaid=true},default)).Success,"registrar records payment separately from completion");
 var unprepared = await courseDocuments.GetStudentReleaseAsync(oldStudent.StudentId);
 Check(unprepared.Data!.Catalog.Count==3 && await db.StudentCourseDocuments.CountAsync()==0,"student catalog includes all three documents without inserting rows");
 await Invoke("CourseDocument",new() { ["studentId"]=oldStudent.StudentId },adminUser,async()=> { Check((await courseDocuments.PrepareAsync(oldStudent.StudentId)).Success,"authorized admin prepares document records"); });
 var pack = await courseDocuments.GetStudentReleaseAsync(oldStudent.StudentId);
 Check(pack.Success && pack.Data!.Documents.Count > 0, "active document preparation remains available");
 var request = await requests.CreateAsync(oldStudent.StudentId, new CreateDocumentRequestDto { DocumentType = "Payment Receipt", Reason = "Verification" });
 Check(request.Success, "active batch accepts document requests");
 var updated = await requests.UpdateStatusAsync(request.Data!.RequestId, "Processing");
 Check(updated.Success, "active batch processes documents");
 var pdfBytes=System.Text.Encoding.ASCII.GetBytes("%PDF-1.4\n% Verification file\n%%EOF");
 IFormFile UploadFile()=>new FormFile(new MemoryStream(pdfBytes),0,pdfBytes.Length,"file","verification.pdf") {Headers=new HeaderDictionary(),ContentType="application/pdf"};
 Check((await requests.SaveReleaseFileAsync(request.Data.RequestId,UploadFile())).Success,"active request accepts release-file upload");
 Check((await requests.UpdateStatusAsync(request.Data.RequestId,"Released")).Success,"active request releases document");
 var courseDoc=pack.Data!.Documents.First(d=>d.DocumentType=="Payment Receipt");
 Check((await courseDocuments.UploadAsync(courseDoc.CourseDocumentId,UploadFile(),admin.AdminId)).Success,"active course document accepts preparation upload");
 Check((await courseDocuments.ReleaseAsync(courseDoc.CourseDocumentId,admin.AdminId)).Success,"active course document releases normally");
 var historicalArchive = new Archive { StudentId = oldStudent.StudentId, ArchiveReason = "Verification", ArchiveDate = DateTime.Now };
 db.Archives.Add(historicalArchive); await db.SaveChangesAsync();
 db.ApplicantRegistrationDocuments.Add(new() {ApplicantId=oldApplicant.ApplicantId,Category="Credential",DocumentLabel="Historical fixture",OriginalFileName="historical.pdf",StoredRelativePath="fixture/historical.pdf",ContentType="application/pdf",UploadedAt=DateTime.Now}); await db.SaveChangesAsync();
 var before = await db.DocumentRequests.CountAsync();
 var completed = await batches.CompleteAsync(oldId);
 Check(completed.Success && completed.Data!.Status == "Completed" && completed.Data.CompletedAt.HasValue && await db.DocumentRequests.CountAsync() == before, "completion preserves requests and history");
 await CheckOperationalReads(0,0,0,0,0,0);
 var savedPrepCount = await db.StudentCourseDocuments.CountAsync();
 Check((await courseDocuments.GetStudentReleaseAsync(oldStudent.StudentId)).Success && await db.StudentCourseDocuments.CountAsync() == savedPrepCount, "historical document viewing performs no inserts");
 await Reject(async()=>await requests.RemoveReleaseFileAsync(request.Data.RequestId),"historical release file cannot be removed");
 var stored=await requests.OpenReleaseFileAsync(request.Data.RequestId);
 Check(stored.Stream is not null,"historical release file remains downloadable"); if(stored.Stream is not null) await stored.Stream.DisposeAsync();
 Check(!(await batches.ActivateAsync(oldId, true)).Success, "completed batch cannot be reactivated");
 await Reject(async()=> { oldApplicant.FirstName = "Changed"; await db.SaveChangesAsync(); }, "historical applicant edit rejected");
 db.ChangeTracker.Clear();
 await Reject(async()=> await requests.UpdateStatusAsync(request.Data.RequestId, "On Hold"), "historical document status rejected"); db.ChangeTracker.Clear();
 await Reject(async()=> await courseDocuments.SetAssessmentDateAsync(oldId, DateTime.Today), "historical assessment edit rejected");
 await Reject(async()=> { var historicalSchedule=await db.CourseSchedules.FindAsync(trainingSchedule.ScheduleId); historicalSchedule!.Room="Changed"; await db.SaveChangesAsync(); },"completed training schedule edits rejected"); db.ChangeTracker.Clear();
 await Reject(async()=> { var s = await db.Students.FindAsync(oldStudent.StudentId); db.Students.Remove(s!); await db.SaveChangesAsync(); }, "historical student deletion rejected"); db.ChangeTracker.Clear();
 await Reject(async()=> { db.Applicants.Add(new Applicant { BatchId=oldId, CourseId=course.CourseId, FirstName="New", LastName="Person", Gender="Male", ContactNumber="09123456780", Email="blocked@example.com", Address="Verification" }); await db.SaveChangesAsync(); }, "historical applicant creation rejected"); db.ChangeTracker.Clear();
 var second = await batches.CreateAsync(new CreateBatchDto { BatchName="Batch2026-102", StartDate=DateTime.Today.AddDays(1), EndDate=DateTime.Today.AddDays(90), ActivateNow=true, ConfirmSwitch=true });
 Check(second.Success, "new active batch created"); var newId = second.Data!.BatchId;
 var fresh = await snapshots.GetAsync(newId, default);
 Check(fresh.Success && !fresh.Data!.ReadOnly && fresh.Data.Applicants.Count == 0 && fresh.Data.Students.Count == 0 && fresh.Data.Requests.Count == 0 && fresh.Data.Archives.Count == 0, "new batch starts empty");
 await CheckOperationalReads(newId,0,0,0,0,0);
 var reused = await Register("batch.verify@example.com", "09123456789");
 Check(reused.BatchId == newId, "previous email and contact can be reused through registration service");
 Check((await applicantService.GetDashboardStatsAsync()).Data is {TotalApplicants:1,Pending:1,ActiveStudents:0,EnrolledStudents:0} && await db.Applicants.CountAsync(a=>a.BatchId==oldId)==1,"new registration updates only the active batch's real counters");
 Check((await applicantService.UpdateStatusAsync(reused.ApplicantId,"Approved")).Success,"new-batch applicant approval uses the existing workflow");
 Check(reused.AssignedTrainingDateTime!.Contains("Batch2026-102"),"approval email uses the new batch fallback, never a historical schedule");
 Check((await applicantService.ConfirmSlotAsync(reused.ConfirmationToken!)).Success,"slot confirmation enrolls the applicant through the real service");
 var currentStudent = await db.Students.SingleAsync(s=>s.ApplicantId==reused.ApplicantId);
 var currentPin=currentStudent.SecurityPin;
 Check(currentStudent.BatchId==newId && currentStudent.AccountStatus=="Inactive" && (await applicantService.GetDashboardStatsAsync()).Data!.AwaitingActivation==1,"confirmed enrollment and pending activation belong only to batch 102");
 var manualEnrollment=await applicantService.AddToSlotAsync(reused.ApplicantId);
 Check(manualEnrollment.Success && manualEnrollment.Data!.StudentId==currentStudent.StudentId && await db.Students.CountAsync(s=>s.BatchId==newId)==1,"manual add-to-slot retry preserves the same enrollment ID");
 Check((await activationService.ActivateAsync(currentStudent.StudentId)).Success && (await db.Students.FindAsync(currentStudent.StudentId))!.SecurityPin==currentPin, "repeat enrollment activation retains unique PIN when historical standardized PIN is reserved");
 var deactivated=await activationService.DeactivateAsync(currentStudent.StudentId,"Other","Isolated workflow verification");
 Check(deactivated.Success && (await activationService.GetSummaryAsync()).Data!.DeactivatedAccounts==1 && (await activationService.GetSummaryAsync()).Data!.PendingActivation==0,"existing deactivation rules archive only the current student and exclude them from pending activation");
 Check(await db.Archives.CountAsync(a=>a.StudentId==oldStudent.StudentId)==1 && (await db.Students.FindAsync(oldStudent.StudentId))!.AccountStatus=="Active","current-batch deactivation preserves the historical archive and account state");
 Check((await activationService.ReactivateAsync(currentStudent.StudentId)).Success && (await db.Students.FindAsync(currentStudent.StudentId))!.SecurityPin==currentPin && !await db.Archives.AnyAsync(a=>a.StudentId==currentStudent.StudentId),"normal reactivation preserves enrollment ID and PIN while restoring its active-batch archive state");
 var realSchedules = new ScheduleService(db,notices,new CourseHistoryRecorder(db,accessor));
 db.TrainingRooms.Add(new() {RoomName="Verification room"}); await db.SaveChangesAsync();
 CreateScheduleDto NewSchedule(int batch,int? replace=null) => new() {BatchId=batch,CourseId=course.CourseId,ScheduleDate=DateTime.Today.AddDays(1),StartTime=TimeSpan.FromHours(8),EndTime=TimeSpan.FromHours(16),Room="Verification room",Trainer="Verification trainer",TrainingDays="Mon,Wed,Fri",Status="Active",ReplaceScheduleId=replace};
 Check(!(await realSchedules.CreateAsync(NewSchedule(newId,trainingSchedule.ScheduleId))).Success,"a new batch cannot replace a historical schedule ID"); db.ChangeTracker.Clear();
 var createdSchedule=await realSchedules.CreateAsync(NewSchedule(newId));
 Check(createdSchedule.Success && createdSchedule.Data!.BatchId==newId,"real schedule creation starts independently using the reusable historical room and trainer");
 await Reject(async()=>await realSchedules.UpdateAsync(createdSchedule.Data!.ScheduleId,new() {BatchId=oldId}),"schedule update cannot transfer an existing schedule to another batch"); db.ChangeTracker.Clear();
 await Reject(async()=>await realSchedules.CreateAsync(NewSchedule(oldId)),"schedule service rejects creation in the completed batch before side effects"); db.ChangeTracker.Clear();
 await Reject(async()=>await notices.CreateAsync("Invalid linkage","Test",studentId:oldStudent.StudentId,applicantId:reused.ApplicantId),"notification service rejects inconsistent student and applicant batch links");
 Check(await db.CourseSchedules.CountAsync(s=>s.BatchId==oldId)==1 && (await db.CourseSchedules.FindAsync(trainingSchedule.ScheduleId))!.Room=="Verification room","historical schedule survives the new training cycle unchanged");
 Check(await db.Notifications.Where(n=>n.StudentId==currentStudent.StudentId).AllAsync(n=>n.BatchId==newId),"enrollment, activation and schedule notifications persist the student's original batch");
 await Reject(async()=> await Register("batch.verify@example.com", "09123456780"), "same-batch email duplicate rejected"); db.ChangeTracker.Clear();
 await Reject(async()=> await Register("other.verify@example.com", "+639123456789"), "same-batch normalized contact duplicate rejected"); db.ChangeTracker.Clear();
 // Verify the database itself, bypassing application validation.
 try {
  await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO applicants(first_name,last_name,gender,birthdate,age,contact_number,email,address,course_id,batch_id,application_status,application_date) VALUES ('Duplicate','Verification','Male','2000-01-01',26,'09123456789','sql.verify@example.com','Verification',{course.CourseId},{newId},'Pending',NOW())");
  throw new Exception("FAIL database unique contact index");
 } catch (MySqlException ex) when (ex.Number == 1062) { Check(true,"database enforces normalized contact uniqueness"); }
 try {
  await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO applicants(first_name,last_name,gender,birthdate,age,contact_number,email,address,course_id,batch_id,application_status,application_date) VALUES ('Duplicate','Email','Male','2000-01-01',26,'09123456780',' BATCH.VERIFY@EXAMPLE.COM ','Verification',{course.CourseId},{newId},'Pending',NOW())");
  throw new Exception("FAIL database unique email index");
 } catch(MySqlException ex) when(ex.Number==1062) {Check(true,"database enforces normalized email uniqueness");}
 try {
  await db.Database.ExecuteSqlRawAsync("INSERT INTO batches(batch_name,start_date,end_date,status) VALUES('Invalid second active',CURRENT_DATE(),CURRENT_DATE(),'Active')");
  throw new Exception("FAIL database single active batch constraint");
 } catch(MySqlException ex) when(ex.Number==1062) {Check(true,"database prevents multiple active batches");}
 var closed = await snapshots.GetAsync(oldId, default);
 Check(closed.Success && closed.Data!.ReadOnly && closed.Data.Students.Count == 1 && closed.Data.Archives.Count == 1 && closed.Data.Requests.Count == before && closed.Data.Applicants.All(a=>a.BatchId==oldId), "completed snapshot separates all historical records");
 Check(closed.Data!.CourseDocuments.Count==3 && closed.Data.CourseDocuments.All(d=>d.BatchId==oldId && d.StudentId==oldStudent.StudentId) && closed.Data.CourseDocuments.Any(d=>d.CourseDocumentId==courseDoc.CourseDocumentId && d.HasFile && d.PreparationStatus=="Released"),"historical snapshot includes prepared and released course documents with original IDs and correct ownership");


 await Reject(async()=>await Invoke("DocumentRequest", new Dictionary<string,object?> { ["studentId"]=oldStudent.StudentId }, new ClaimsPrincipal(), async()=> { await requests.CreateAsync(oldStudent.StudentId,new CreateDocumentRequestDto {DocumentType="Certificate of Completion",Reason="Verification"}); }), "anonymous historical document submission rejected");
 var studentUser = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier,oldStudent.StudentId.ToString()), new Claim(ClaimTypes.Role,"Student") }, "StudentSession"));
 Check(!(await requests.CreateAsync(oldStudent.StudentId,new() {DocumentType="Certificate of Completion",Reason="Verification"})).Success,"batch completion alone does not grant certificate eligibility");
 Check((await new StudentDocumentCatalog(db).VerifyAsync(oldStudent.StudentId,admin.AdminId,new() {FeesPaid=true,TrainingCompleted=true},default)).Success,"training completion recorded without assuming assessment completion");
 Check(!(await requests.CreateAsync(oldStudent.StudentId,new() {DocumentType="Certificate of Completion",Reason="Verification"})).Success,"training alone does not satisfy assessment eligibility");
 await new StudentDocumentCatalog(db).VerifyAsync(oldStudent.StudentId,admin.AdminId,new() {FeesPaid=true,TrainingCompleted=true,AssessmentCompleted=true},default);
 var portal = new StudentPortalService(db,requests,notices);
 var closedDashboard = await portal.GetDashboardAsync(oldStudent.StudentId);
 Check(closedDashboard.Data!.Profile.BatchName=="Batch2026-101" && !closedDashboard.Data.Profile.CanViewTrainingSchedule && closedDashboard.Data.ClassSchedules.Count==0,"completed dashboard retains batch identity and has no training schedule");
 var beforeBulk=(await batches.GetAllAsync()).Data!.Single(b=>b.BatchId==oldId).UnreadDocumentNotifications;
 await Invoke("DocumentRequest",new() {["dto"]=new BulkStatusDto {Ids=new() {earlyNc.Data!.RequestId},Status="Processing"}},adminUser,async()=> {
   Check((await requests.BulkUpdateStatusAsync(new() {Ids=new() {earlyNc.Data!.RequestId},Status="Processing"})).Success,"authorized completed-batch bulk document update succeeds");
 });
 Check((await batches.GetAllAsync()).Data!.Single(b=>b.BatchId==oldId).UnreadDocumentNotifications==beforeBulk+1,"completed bulk document update generates linked unread notification");
 var unreadBefore=(await batches.GetAllAsync()).Data!.Single(b=>b.BatchId==oldId).UnreadDocumentNotifications;
 await Invoke("DocumentRequest", new Dictionary<string,object?> { ["studentId"]=oldStudent.StudentId }, studentUser, async()=> {
  var r=await requests.CreateAsync(oldStudent.StudentId,new CreateDocumentRequestDto {DocumentType="Certificate of Completion",Reason="Verification"}); Check(r.Success,"authenticated student submits historical request");
 });
 var batchNotifications=await notices.GetAdminNotificationsAsync(batchId:oldId);
 Check(batchNotifications.Data!.All(n=>n.BatchId==oldId) && batchNotifications.Data!.Any(n=>n.RequestId.HasValue), "historical notifications identify batch and request");
 Check((await batches.GetAllAsync()).Data!.Single(b=>b.BatchId==oldId).UnreadDocumentNotifications==unreadBefore+1, "historical unread count increments exactly once");
 var latest=batchNotifications.Data!.OrderByDescending(n=>n.NotificationId).First(); await notices.MarkReadAsync(latest.NotificationId);
 Check((await batches.GetAllAsync()).Data!.Single(b=>b.BatchId==oldId).UnreadDocumentNotifications==unreadBefore, "mark-read decreases only the matching batch count");
 Check((await batches.GetAllAsync()).Data!.Single(b=>b.BatchId==newId).UnreadDocumentNotifications==0, "other batch notification count remains separate");
 await Reject(async()=>await Invoke("DocumentRequest", new Dictionary<string,object?> { ["id"]=request.Data.RequestId }, new ClaimsPrincipal(), ()=>Task.CompletedTask), "backend filter blocks historical request mutation before action");
 var activeRequest = await db.DocumentRequests.AsNoTracking().Where(r=>r.StudentId==oldStudent.StudentId).CountAsync();
 await Invoke("DocumentRequest", new Dictionary<string,object?> { ["studentId"]=oldStudent.StudentId }, studentUser, async()=> {
  var r=await requests.CreateAsync(oldStudent.StudentId,new CreateDocumentRequestDto {DocumentType="Certificate of Completion",Reason="Verification"}); Check(!r.Success,"repeated historical request is not duplicated");
 });
 Check(await db.DocumentRequests.CountAsync(r=>r.StudentId==oldStudent.StudentId)==activeRequest,"retry creates no duplicate request or notification");
 var completedRequest = await db.DocumentRequests.Where(r=>r.StudentId==oldStudent.StudentId && r.DocumentType=="Certificate of Completion").SingleAsync();
 await Invoke("DocumentRequest",new() { ["id"]=completedRequest.RequestId },adminUser,async()=> {
   Check((await requests.UpdateStatusAsync(completedRequest.RequestId,"Processing")).Success,"authorized admin processes completed-batch request");
   Check((await requests.SaveReleaseFileAsync(completedRequest.RequestId,UploadFile())).Success,"authorized admin uploads completed-batch release");
   Check((await requests.UpdateStatusAsync(completedRequest.RequestId,"Released")).Success,"authorized admin releases completed-batch request");
   Check(!(await requests.RemoveReleaseFileAsync(completedRequest.RequestId)).Success,"even admins cannot remove released request files");
 });
 var closedCatalog = (await requests.GetStudentCatalogAsync(oldStudent.StudentId)).Data!;
 Check(closedCatalog.Single(d=>d.DocumentType=="Certificate of Completion").DownloadUrl is not null,"released request soft copy remains in completed student catalog");
 Check(!closedCatalog.Single(d=>d.DocumentType=="Certificate of Completion").CanRequest,"released documents cannot be requested again");
 var restored = await requests.OpenReleaseFileAsync(request.Data.RequestId);
 Check(restored.Stream is not null,"original released file survives lifecycle and later processing");
 if(restored.Stream is not null) {using var bytes=new MemoryStream();await restored.Stream.CopyToAsync(bytes);await restored.Stream.DisposeAsync();Check(bytes.ToArray().SequenceEqual(pdfBytes),"original released bytes are unchanged");}
 await Invoke("CourseDocument",new() { ["studentId"]=oldStudent.StudentId },adminUser,async()=> {
   var historicalPack=await courseDocuments.PrepareAsync(oldStudent.StudentId);
   var nc=historicalPack.Data!.Documents.Single(d=>d.DocumentType=="National Certificate (TESDA)");
   Check((await courseDocuments.UploadAsync(nc.CourseDocumentId,UploadFile(),admin.AdminId)).Success,"completed batch accepts authorized course document preparation");
   Check((await courseDocuments.ReleaseAsync(nc.CourseDocumentId,admin.AdminId)).Success,"completed batch accepts authorized course document release");
 });
 Check((await batches.GetAllAsync()).Data!.Single(b=>b.BatchId==oldId).UnreadDocumentNotifications>0,"completed-batch document activity carries unread badge");
 Check((await notices.GetAdminNotificationsAsync(batchId:newId)).Data!.All(n=>n.BatchId==newId),"batch notification queries never leak another batch");
 var beforeView=(await db.Batches.FindAsync(oldId))!.CompletedAt;
 await snapshots.GetAsync(oldId,default);await snapshots.GetAsync(oldId,default);
 Check((await db.Batches.FindAsync(oldId))!.Status=="Completed" && (await db.Batches.FindAsync(oldId))!.CompletedAt==beforeView,"reopening is navigation only and preserves completion date");
 await CheckOperationalReads(newId,1,1,0,0,1);
 Check((await applicantService.GetApplicantsAsync(batchId:oldId)).Data!.Count==1 && (await activationService.GetAccountsAsync(batchId:oldId)).Data!.Count==1 && (await archiveService.GetAllAsync(batchId:oldId)).Data!.Count==1,"explicit historical lists retain original applicant, student and archive records");
 Check((await applicantService.GetAllRegistrationDocumentsAsync(batchId:oldId)).Data!.Single().ApplicantId==oldApplicant.ApplicantId,"explicit historical registration documents remain available");
 Check((await requests.GetAllAsync(batchId:oldId)).Data!.Count==activeRequest && (await courseDocuments.GetBoardAsync(course.CourseId,oldId)).Data!.EnrolledStudents==1,"explicit historical document requests and release board remain available");
 await VerifyAuthorization(db,oldStudent.StudentId,admin.AdminId,completedRequest.RequestId);
 var activeIdentity=await new AuthService(db).StudentLoginAsync(new() {SecurityPin=currentPin});
 Check(activeIdentity.Success && activeIdentity.Data?.UserId==currentStudent.StudentId,"active fixture can sign in before HTTP checks: "+activeIdentity.Message);
 // Use the normal password workflow for an additional HTTP sign-in fixture.
 db.StudentLoginCredentials.Add(new() {StudentId=currentStudent.StudentId,Username=VerificationAccounts.StudentUsername,PasswordHash=BCrypt.Net.BCrypt.HashPassword(VerificationAccounts.Password),PasswordLoginEnabled=true});
 await db.SaveChangesAsync();
 await VerifyHttp(testConnection, env.ContentRootPath, oldStudent.StudentId, oldApplicant.ApplicantId, request.Data.RequestId, currentStudent.StudentId, originalPin, pdfBytes, admin.AdminId);
 await VerifyFutureBatch();
 await VerifyFreshMigration(source, testName, connection);
 Console.WriteLine("ALL BATCH INTEGRATION CHECKS PASSED");
 if(args.Contains("--serve")) {
  var start=new System.Diagnostics.ProcessStartInfo("dotnet") {UseShellExecute=false,CreateNoWindow=true};
  start.ArgumentList.Add(Path.Combine(AppContext.BaseDirectory,"ABEC System.dll"));start.ArgumentList.Add("--urls");start.ArgumentList.Add("http://localhost:5199");
  start.ArgumentList.Add("--contentRoot");start.ArgumentList.Add(env.ContentRootPath);start.ArgumentList.Add("--webroot");start.ArgumentList.Add(Path.Combine(Directory.GetCurrentDirectory(),"wwwroot"));
  start.Environment["Email__Enabled"]="false";
  start.Environment["ConnectionStrings__DefaultConnection"]=testConnection;
  start.Environment["ASPNETCORE_ENVIRONMENT"]="Production";
  using var server=System.Diagnostics.Process.Start(start)!;
  Console.WriteLine("UI verification server: http://localhost:5199/Views/Admin/DocumentManagement.html?batchId="+oldId);
  try {Console.ReadLine();} finally {if(!server.HasExited) {server.Kill(true);await server.WaitForExitAsync();}}
 }

 async Task<Applicant> Register(string mail,string phone) {
  var dto = RegistrationFixture(course.CourseId, mail, phone);
  var result=await applicantService.EnrollAsync(dto); if(!result.Success) throw new BatchIntegrityException(result.Message);
  return (await db.Applicants.FindAsync(result.Data!.ApplicantId))!;
 }
 async Task VerifyFutureBatch() {
  var priorApplicants=JsonSerializer.Serialize(await db.Applicants.AsNoTracking().OrderBy(a=>a.ApplicantId).Select(a=>new {a.ApplicantId,a.BatchId}).ToListAsync());
  var priorStudents=JsonSerializer.Serialize(await db.Students.AsNoTracking().OrderBy(s=>s.StudentId).Select(s=>new {s.StudentId,s.ApplicantId,s.BatchId,s.AccountStatus,s.SecurityPin}).ToListAsync());
  var priorFiles=JsonSerializer.Serialize(await db.DocumentRequests.AsNoTracking().OrderBy(r=>r.RequestId).Select(r=>new {r.RequestId,r.StudentId,r.ReleaseStoredPath,r.ReleaseFileName}).ToListAsync());
  var secondApplicantCount=await db.Applicants.CountAsync(a=>a.BatchId==newId);
  var third=await batches.CreateAsync(new() {BatchName="Batch2026-103",StartDate=DateTime.Today.AddDays(2),EndDate=DateTime.Today.AddDays(180),ActivateNow=true,ConfirmSwitch=true});
  Check(third.Success && third.Data!.Status=="Active","future batch 103 creates and activates through the normal lifecycle service");
  var thirdId=third.Data!.BatchId;
  await CheckOperationalReads(thirdId,0,0,0,0,0);
  Check(priorApplicants==JsonSerializer.Serialize(await db.Applicants.AsNoTracking().OrderBy(a=>a.ApplicantId).Select(a=>new {a.ApplicantId,a.BatchId}).ToListAsync()) && priorStudents==JsonSerializer.Serialize(await db.Students.AsNoTracking().OrderBy(s=>s.StudentId).Select(s=>new {s.StudentId,s.ApplicantId,s.BatchId,s.AccountStatus,s.SecurityPin}).ToListAsync()),"batch 103 activation preserves all earlier applicant/student identifiers, ownership, account state and PINs");
  Check(priorFiles==JsonSerializer.Serialize(await db.DocumentRequests.AsNoTracking().OrderBy(r=>r.RequestId).Select(r=>new {r.RequestId,r.StudentId,r.ReleaseStoredPath,r.ReleaseFileName}).ToListAsync()),"future activation preserves released request file metadata");
  var thirdApplicant=await Register("batch.verify@example.com","09123456789");
  Check(thirdApplicant.BatchId==thirdId && (await applicantService.GetDashboardStatsAsync()).Data!.Pending==1,"future registrations automatically enter batch 103 and update only its dashboard");
  var firstHistory=(await snapshots.GetAsync(oldId,default)).Data!;
  var secondHistory=(await snapshots.GetAsync(newId,default)).Data!;
  Check(firstHistory.ReadOnly && secondHistory.ReadOnly && firstHistory.Applicants.Count==1 && firstHistory.Students.Count==1 && secondHistory.Applicants.Count==secondApplicantCount && secondHistory.Students.Count==1,"both previous training cycles retain independent complete histories after batch 103 activation");
  Check((await realSchedules.GetAllAsync(batchId:oldId)).Data!.Count==1 && (await realSchedules.GetAllAsync(batchId:newId)).Data!.Count==1 && (await realSchedules.GetAllAsync()).Data!.Count==0,"batch 103 never inherits either previous training schedule");
  await Reject(async()=> {var person=await db.Applicants.FindAsync(thirdApplicant.ApplicantId);person!.BatchId=oldId;await db.SaveChangesAsync();},"existing applicant cannot be transferred into another batch"); db.ChangeTracker.Clear();
  await Reject(async()=> {db.Students.Add(new() {ApplicantId=thirdApplicant.ApplicantId,BatchId=newId,SecurityPin="invalid-owner",AccountStatus="Inactive"});await db.SaveChangesAsync();},"new student cannot be enrolled under a different batch than their applicant"); db.ChangeTracker.Clear();
  var original=await requests.OpenReleaseFileAsync(request.Data!.RequestId);
  Check(original.Stream is not null,"original batch 101 released file remains available after two batch switches");
  if(original.Stream is not null) {using var bytes=new MemoryStream();await original.Stream.CopyToAsync(bytes);await original.Stream.DisposeAsync();Check(bytes.ToArray().SequenceEqual(pdfBytes),"future activation preserves the original released bytes");}
 }
 async Task CheckOperationalReads(int expectedBatch, int applicantsCount, int studentsCount, int archivesCount, int requestsCount, int schedulesCount) {
  var stats=(await applicantService.GetDashboardStatsAsync()).Data!;
  Check(stats.EnrolledStudents==studentsCount && stats.ReadyToReleaseDocuments==0 && stats.Approved==studentsCount && stats.Pending==0 && stats.Waitlisted==0 && stats.Rejected==0 && stats.AvailableCourses==1,"all batch-specific initial counters are isolated while global courses remain available for batch "+expectedBatch);
  Check(stats.TotalApplicants==applicantsCount && stats.ActiveStudents==studentsCount && stats.AwaitingActivation==0 && stats.PendingDocuments==0 && stats.ReleasedDocuments==0 && stats.UpcomingSchedules==schedulesCount,"dashboard counters exclude history for batch "+expectedBatch);
  var applicants=(await applicantService.GetApplicantsAsync()).Data!;
  Check(applicants.Count==applicantsCount && applicants.All(a=>a.BatchId==expectedBatch),"default applicant list and recent/search source use current batch "+expectedBatch);
  var accounts=(await activationService.GetAccountsAsync()).Data!;
  Check(accounts.Count==studentsCount && accounts.All(s=>s.BatchId==expectedBatch) && (await activationService.GetSummaryAsync()).Data!.TotalApprovedStudents==studentsCount,"activation list and summary use current batch "+expectedBatch);
  Check((await archiveService.GetAllAsync()).Data!.Count==archivesCount && (await requests.GetAllAsync()).Data!.Count==requestsCount,"archive and request defaults exclude history for batch "+expectedBatch);
  var history=new CourseHistoryRecorder(db,accessor);
  var schedules=(await new ScheduleService(db,notices,history).GetAllAsync()).Data!;
  Check(schedules.Count==schedulesCount && schedules.All(s=>s.BatchId==expectedBatch),"schedule default excludes prior active-status schedules for batch "+expectedBatch);
  var courses=new CourseService(db,history);
  Check((await courses.GetEnrolledStudentsAsync(course.CourseId)).Data!.Count==studentsCount,"course enrollment registry uses current batch "+expectedBatch);
  Check((await applicantService.GetAllRegistrationDocumentsAsync()).Data!.Count==0,"default registration documents exclude historical uploads for batch "+expectedBatch);
  var board=(await courseDocuments.GetBoardAsync(course.CourseId,null)).Data!;
  Check(board.EnrolledStudents==studentsCount && (expectedBatch==0 ? board.Timeline.BatchId is null : board.Timeline.BatchId==expectedBatch),"course release board never falls back to the largest historical batch "+expectedBatch);
  var documentStats=(await requests.GetDashboardAsync()).Data!;
  Check(documentStats.Pending==0 && documentStats.Processing==0 && documentStats.Released==0 && documentStats.OnHold==0,"document dashboard excludes historical activity for batch "+expectedBatch);
  Check((await notices.GetAdminNotificationsAsync()).Data!.All(n=>n.BatchId==expectedBatch),"default notification bell uses current batch "+expectedBatch);
 }
 async Task Invoke(string controller,Dictionary<string,object?> arguments,ClaimsPrincipal user,Func<Task> action) {
  var http=new DefaultHttpContext {User=user}; http.Request.Method="POST";
  var route=new RouteData(); route.Values["controller"]=controller;
  var context=new ActionContext(http,route,new ActionDescriptor());
  await filter.OnActionExecutionAsync(new ActionExecutingContext(context,new List<IFilterMetadata>(),arguments,new object()),async()=> {await action();return new ActionExecutedContext(context,new List<IFilterMetadata>(),new object());});
 }
}
finally {
 MySqlConnection.ClearAllPools();
 if(!System.Text.RegularExpressions.Regex.IsMatch(testName,"^abec_batch_verify_[a-f0-9]{32}$")) throw new Exception("Unsafe test database name");
 await using var drop=new MySqlCommand($"DROP DATABASE `{testName}`",source); await drop.ExecuteNonQueryAsync();
 var testFiles=Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(),"App_Data","batch-verification-files",testName));
 var expectedRoot=Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(),"App_Data","batch-verification-files"))+Path.DirectorySeparatorChar;
 if(testFiles.StartsWith(expectedRoot,StringComparison.OrdinalIgnoreCase) && Directory.Exists(testFiles)) Directory.Delete(testFiles,true);
 Console.WriteLine("Removed isolated verification database and test files; existing records unchanged.");
}
static async Task VerifyAuthorization(ApplicationDbContext db, int studentId, int adminId, int requestId)
{
 var student = new ClaimsPrincipal(new ClaimsIdentity(new[] {new Claim(ClaimTypes.NameIdentifier,studentId.ToString()),new Claim(ClaimTypes.Role,"Student")},"StudentSession"));
 var admin = new ClaimsPrincipal(new ClaimsIdentity(new[] {new Claim(ClaimTypes.NameIdentifier,adminId.ToString()),new Claim(ClaimTypes.Role,"Admin")},"StudentSession"));
 async Task<bool> Allowed(string controller,string action,ClaimsPrincipal user,string routeName,int value,bool forgedHeader=false) {
  var http=new DefaultHttpContext {User=user}; if(forgedHeader)http.Request.Headers["X-Abec-Admin-Id"]=adminId.ToString();
  var route=new RouteData();route.Values["controller"]=controller;route.Values["action"]=action;route.Values[routeName]=value;
  var ctx=new AuthorizationFilterContext(new ActionContext(http,route,new ActionDescriptor()),new List<IFilterMetadata>());
  await new BatchAccessFilter(db).OnAuthorizationAsync(ctx); return ctx.Result is null;
 }
 Check(!await Allowed("BatchApi","Documents",new ClaimsPrincipal(),"id",1,true),"forged admin header cannot authorize batch access");
 Check(await Allowed("BatchApi","Documents",admin,"id",1),"authenticated admin can view completed-batch documents");
 Check(await Allowed("StudentApi","Profile",student,"studentId",studentId),"authenticated student can read own completed enrollment");
 Check(!await Allowed("StudentApi","Profile",student,"studentId",studentId+1000),"student cannot read another enrollment");
 Check(!await Allowed("StudentApi","Schedule",student,"studentId",studentId),"completed student schedule API is denied by server");
 Check(await Allowed("DocumentRequest","DownloadFile",student,"id",requestId),"owner can download own released completed-batch file");
 Check(!await Allowed("CourseDocument","VerifyEligibility",student,"studentId",studentId),"student cannot self-certify fees or completion");
 Check(!await Allowed("DocumentRequest","UpdateStatus",student,"id",requestId),"student cannot act as document administrator");
}
static async Task VerifyHttp(string connection, string filesRoot, int studentId, int applicantId, int requestId, int activeStudentId, string originalPin, byte[] expected, int fixtureAdminId)
{
 var listener=new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback,0);listener.Start();var port=((System.Net.IPEndPoint)listener.LocalEndpoint).Port;listener.Stop();
 using var https = new VerificationHttps(filesRoot);
 var start=new System.Diagnostics.ProcessStartInfo("dotnet") {UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};
 start.ArgumentList.Add(Path.Combine(AppContext.BaseDirectory,"ABEC System.dll"));start.ArgumentList.Add("--urls");start.ArgumentList.Add($"https://127.0.0.1:{port}");
 start.ArgumentList.Add("--contentRoot");start.ArgumentList.Add(filesRoot);
 start.ArgumentList.Add("--webroot");start.ArgumentList.Add(Path.Combine(Directory.GetCurrentDirectory(),"wwwroot"));
 start.Environment["ConnectionStrings__DefaultConnection"]=connection;start.Environment["ASPNETCORE_ENVIRONMENT"]="Production";start.Environment["Email__Enabled"]="false";
 https.Configure(start);
 // Copy static pages only; all private uploads remain under the isolated fixture root.
 var viewRoot=Path.Combine(Directory.GetCurrentDirectory(),"Views");
 foreach(var file in Directory.EnumerateFiles(viewRoot,"*.html",SearchOption.AllDirectories)) {
  var destination=Path.Combine(filesRoot,"Views",Path.GetRelativePath(viewRoot,file));Directory.CreateDirectory(Path.GetDirectoryName(destination)!);File.Copy(file,destination,true);
 }
 using var process=System.Diagnostics.Process.Start(start)!;
 var stdout=process.StandardOutput.ReadToEndAsync();var stderr=process.StandardError.ReadToEndAsync();
 var privateLinkToken=Guid.NewGuid().ToString("N");
 try {
  using var anonymous=https.Client(new Uri($"https://127.0.0.1:{port}"));
  var ready=false;for(var n=0;n<80;n++){try{using var health=await anonymous.GetAsync("/api/health");if(health.IsSuccessStatusCode){ready=true;break;}}catch(HttpRequestException){}await Task.Delay(250);}
  Check(ready,"isolated HTTP application starts");
  var invalidLink=await anonymous.GetStringAsync("/confirm-slot?token="+privateLinkToken);
  Check(invalidLink.Contains("invalid",StringComparison.OrdinalIgnoreCase),"HTTP invalid email token shows a clear message without changing an offer");
  Check((await anonymous.GetAsync("/api/batches")).StatusCode==System.Net.HttpStatusCode.Unauthorized,"HTTP anonymous batch records denied");
  anonymous.DefaultRequestHeaders.Add("X-Abec-Admin-Id",fixtureAdminId.ToString());
  Check((await anonymous.GetAsync("/api/batches")).StatusCode==System.Net.HttpStatusCode.Unauthorized,"HTTP forged admin header denied");
  using var admin=https.Client(anonymous.BaseAddress!);
  using var login=await admin.PostAsync("/api/auth/admin-login",new StringContent(JsonSerializer.Serialize(new {username=VerificationAccounts.AdminUsername,password=VerificationAccounts.Password}),System.Text.Encoding.UTF8,"application/json"));
  Check(login.IsSuccessStatusCode && (await admin.GetAsync("/api/batches")).IsSuccessStatusCode,"HTTP admin login issues usable server session");
  var sessionCookie=login.Headers.GetValues("Set-Cookie").Single(c=>c.StartsWith("abec-student-session=",StringComparison.Ordinal));
  Check(sessionCookie.Contains("secure",StringComparison.OrdinalIgnoreCase) && sessionCookie.Contains("httponly",StringComparison.OrdinalIgnoreCase) && sessionCookie.Contains("samesite=strict",StringComparison.OrdinalIgnoreCase),"Production session cookie is Secure, HttpOnly and SameSite Strict over HTTPS");
  using var loginBody=JsonDocument.Parse(await login.Content.ReadAsStringAsync());
  var adminId=loginBody.RootElement.GetProperty("data").GetProperty("userId").GetInt32();
  Check((await admin.GetAsync($"/api/admin/profile/{adminId}")).IsSuccessStatusCode,"HTTP admin can read their own profile");
  Check((await admin.GetAsync($"/api/admin/profile/{adminId+1000}")).StatusCode==System.Net.HttpStatusCode.Forbidden,"HTTP admin cannot read another admin profile");
  Check((await anonymous.GetAsync("/api/training-rooms")).StatusCode==System.Net.HttpStatusCode.Unauthorized,"HTTP anonymous training room records denied");
  using(var blocked=await anonymous.PostAsync("/api/training-rooms",new StringContent("{}",System.Text.Encoding.UTF8,"application/json")))
   Check(blocked.StatusCode==System.Net.HttpStatusCode.Unauthorized,"HTTP anonymous room creation denied before model binding");
  using(var headers=await admin.GetAsync("/api/batches"))
   Check(headers.Headers.GetValues("X-Content-Type-Options").Single()=="nosniff" && headers.Headers.CacheControl?.NoStore==true && headers.Headers.Contains("Strict-Transport-Security"),"HTTPS API responses disable MIME sniffing and caching and require secure transport");
  using var oldSession=https.Client(anonymous.BaseAddress!);
  oldSession.DefaultRequestHeaders.Add("Cookie",sessionCookie.Split(';')[0]);
  Check((await oldSession.GetAsync("/api/batches")).IsSuccessStatusCode,"Copied original session is valid before password change");
  using(var attack=new HttpRequestMessage(HttpMethod.Post,$"/api/admin/profile/{adminId}/change-password")) {
   attack.Headers.Add("Origin","https://attacker.example.invalid");attack.Headers.Add("Sec-Fetch-Site","same-site");
   attack.Content=new StringContent("{}",System.Text.Encoding.UTF8,"application/json");
   using var blocked=await admin.SendAsync(attack);
   Check(blocked.StatusCode==System.Net.HttpStatusCode.Forbidden,"HTTP cross-origin cookie write blocked before execution");
  }
  oldSession.DefaultRequestHeaders.Remove("Origin");
  using(var blocked=await oldSession.PostAsync($"/api/admin/profile/{adminId}/change-password",new StringContent("{}",System.Text.Encoding.UTF8,"application/json")))
   Check(blocked.StatusCode==System.Net.HttpStatusCode.Forbidden,"HTTP cookie writes without origin evidence denied");
  oldSession.DefaultRequestHeaders.Add("Origin",ABEC_System.Options.AppSettings.DefaultProductionBaseUrl);
  using(var page=await admin.GetAsync("/Views/Admin/BatchManagement.html")) {
   var html=await page.Content.ReadAsStringAsync();
   Check(page.IsSuccessStatusCode && html.Contains("<title>Batch Management - ABEC Admin</title>") && html.Contains("abec-batches.js?") && html.Contains("id=\"modal-create-batch\""),"HTTP dedicated batch page serves its controller and lifecycle dialogs");
  }
  using(var page=await admin.GetAsync("/Views/Admin/AdminDashboard.html")) {
   var html=await page.Content.ReadAsStringAsync();
   Check(page.IsSuccessStatusCode && html.Contains("href=\"BatchManagement.html\"") && !html.Contains("data-purpose=\"current-active-batch\"") && !html.Contains("id=\"modal-change-batch\""),"HTTP dashboard links to Batch Management without retaining its controls");
  }
  using(var route=await admin.GetAsync("/Admin/BatchManagement"))
   Check(route.StatusCode==System.Net.HttpStatusCode.Redirect && route.Headers.Location?.OriginalString=="/Views/Admin/BatchManagement.html","HTTP admin batch route redirects to the dedicated page");
  Check((await anonymous.GetAsync("/Admin/BatchManagement")).StatusCode==System.Net.HttpStatusCode.Unauthorized,"HTTP batch page controller route retains admin authorization");
  Check((await admin.GetAsync("/wwwroot/js/abec-batches.js")).IsSuccessStatusCode,"HTTP dedicated lifecycle JavaScript is available");
  Check((await admin.GetAsync("/wwwroot/css/abec-batches.css")).IsSuccessStatusCode,"HTTP dedicated batch page styles are available");
  async Task<JsonElement> AdminData(string path) {
   using var response=await admin.GetAsync(path);response.EnsureSuccessStatusCode();
   using var body=JsonDocument.Parse(await response.Content.ReadAsStringAsync());
   Check(body.RootElement.GetProperty("success").GetBoolean(),"HTTP scoped endpoint succeeds: "+path);
   return body.RootElement.GetProperty("data").Clone();
  }
  var activeProfile=await AdminData($"/api/student/{activeStudentId}/profile");
  var oldProfile=await AdminData($"/api/student/{studentId}/profile");
  var currentBatchId=activeProfile.GetProperty("batchId").GetInt32();
  var historicalBatchId=oldProfile.GetProperty("batchId").GetInt32();
  foreach(var endpoint in new[] {"/api/applicants","/api/activations","/api/schedules"}) {
   var current=await AdminData(endpoint);
   Check(current.GetArrayLength()==1 && current.EnumerateArray().All(r=>r.GetProperty("batchId").GetInt32()==currentBatchId),"HTTP operational list contains only current batch: "+endpoint);
  }
  foreach(var endpoint in new[] {"/api/archives","/api/document-requests","/api/applicants/registration-documents"}) {
   Check((await AdminData(endpoint)).GetArrayLength()==0,"HTTP empty current list excludes historical records: "+endpoint);
   Check((await AdminData(endpoint+"?batchId="+historicalBatchId)).GetArrayLength()>0,"HTTP explicit batch query preserves history: "+endpoint);
  }
  var dashboard=await AdminData("/api/applicants/stats");
  Check(dashboard.GetProperty("totalApplicants").GetInt32()==1 && dashboard.GetProperty("activeStudents").GetInt32()==1 && dashboard.GetProperty("releasedDocuments").GetInt32()==0,"HTTP dashboard totals exclude completed batch");
  Check((await AdminData("/api/activations/summary")).GetProperty("totalApprovedStudents").GetInt32()==1,"HTTP activation summary excludes historical accounts");
  var courseId=activeProfile.GetProperty("courseId").GetInt32();
  Check((await AdminData($"/api/courses/{courseId}/students")).GetArrayLength()==1,"HTTP course enrollment registry matches active capacity scope");
  var board=await AdminData($"/api/course-documents/board?courseId={courseId}");
  Check(board.GetProperty("enrolledStudents").GetInt32()==1 && board.GetProperty("timeline").GetProperty("batchId").GetInt32()==currentBatchId,"HTTP release board defaults to current batch");
  var historicalSnapshot=await AdminData($"/api/batches/{historicalBatchId}/documents");
  Check(historicalSnapshot.GetProperty("courseDocuments").GetArrayLength()==3 && historicalSnapshot.GetProperty("courseDocuments").EnumerateArray().All(d=>d.GetProperty("batchId").GetInt32()==historicalBatchId && d.GetProperty("studentId").GetInt32()==studentId && !d.TryGetProperty("storedPath",out _)),"HTTP historical table includes its own course document metadata without exposing storage paths");
  var previewDocumentId=historicalSnapshot.GetProperty("courseDocuments").EnumerateArray().First(d=>d.GetProperty("preparationStatus").GetString()=="Released").GetProperty("courseDocumentId").GetInt32();
  using(var preview=await admin.GetAsync($"/api/course-documents/{previewDocumentId}/file?inline=true")) {
   Check(preview.IsSuccessStatusCode && preview.Content.Headers.ContentType?.MediaType=="application/pdf" && (await preview.Content.ReadAsByteArrayAsync()).SequenceEqual(expected),"Authenticated fixed-route preview streams the exact verified PDF bytes");
   Check(preview.Content.Headers.ContentDisposition?.DispositionType!="attachment" && preview.Headers.GetValues("X-Content-Type-Options").Single()=="nosniff","Inline preview preserves browser display and prevents MIME sniffing");
  }
  Check((await anonymous.GetAsync($"/api/course-documents/{previewDocumentId}/file?inline=true")).StatusCode==System.Net.HttpStatusCode.Unauthorized,"Anonymous direct preview navigation cannot bypass authorization");
  var currentSnapshot=await AdminData($"/api/batches/{currentBatchId}/documents");
  Check(currentSnapshot.GetProperty("courseDocuments").EnumerateArray().All(d=>d.GetProperty("batchId").GetInt32()==currentBatchId && d.GetProperty("studentId").GetInt32()!=studentId),"HTTP current document table excludes every historical course document");
  Check((await admin.GetAsync($"/api/batches/{historicalBatchId}/documents?batchId={currentBatchId}")).StatusCode==System.Net.HttpStatusCode.Conflict,"HTTP document snapshot rejects a batch context that disagrees with its selected batch");

  Check(historicalSnapshot.GetProperty("registrationDocuments").GetArrayLength()==1 && historicalSnapshot.GetProperty("students").GetArrayLength()==1,"HTTP historical document snapshot remains available");
  var currentApplicantId=activeProfile.GetProperty("applicantId").GetInt32();
  Check((await admin.GetAsync($"/api/applicants/{currentApplicantId}?batchId={historicalBatchId}")).StatusCode==System.Net.HttpStatusCode.Conflict,"HTTP record read rejects an incorrect selected BatchId");
  using var wrongStatus=await admin.PutAsync($"/api/applicants/{currentApplicantId}/status?batchId={historicalBatchId}",new StringContent("{\"status\":\"Rejected\"}",System.Text.Encoding.UTF8,"application/json"));
  Check(wrongStatus.StatusCode==System.Net.HttpStatusCode.Conflict,"HTTP applicant write rejects an incorrect selected BatchId before changing status");
  using var mixedBulk=await admin.PostAsync($"/api/applicants/bulk-status?batchId={currentBatchId}",new StringContent(JsonSerializer.Serialize(new {ids=new[]{currentApplicantId,applicantId},status="Rejected"}),System.Text.Encoding.UTF8,"application/json"));
  Check(mixedBulk.StatusCode==System.Net.HttpStatusCode.Conflict,"HTTP mixed-batch bulk operation is rejected before any record is changed");
  Check((await AdminData($"/api/applicants/{currentApplicantId}?batchId={currentBatchId}")).GetProperty("applicationStatus").GetString()=="Confirmed Slot","HTTP rejected cross-batch writes preserve the current applicant's status");
  Check((await admin.GetAsync($"/api/document-requests/{requestId}/file?batchId={currentBatchId}")).StatusCode==System.Net.HttpStatusCode.Conflict,"HTTP released-file access rejects incorrect batch context even for an admin");
  Check((await admin.GetByteArrayAsync($"/api/document-requests/{requestId}/file?batchId={historicalBatchId}")).SequenceEqual(expected),"HTTP correct historical context downloads the same released file");
  using var wrongEligibility=await admin.PutAsync($"/api/course-documents/student/{studentId}/eligibility?batchId={currentBatchId}",new StringContent("{\"feesPaid\":false}",System.Text.Encoding.UTF8,"application/json"));
  Check(wrongEligibility.StatusCode==System.Net.HttpStatusCode.Conflict,"HTTP document administration rejects a student from a different selected batch");
  Check((await AdminData($"/api/course-documents/student/{studentId}/eligibility?batchId={historicalBatchId}")).GetProperty("feesPaidAt").ValueKind!=JsonValueKind.Null,"rejected cross-batch document write preserves individual eligibility");
  var currentSchedule=(await AdminData("/api/schedules"))[0].GetProperty("scheduleId").GetInt32();
  using var wrongSchedule=await admin.PutAsync($"/api/schedules/{currentSchedule}",new StringContent(JsonSerializer.Serialize(new {batchId=historicalBatchId}),System.Text.Encoding.UTF8,"application/json"));
  Check(wrongSchedule.StatusCode==System.Net.HttpStatusCode.Conflict,"HTTP schedule update cannot change enrollment batch ownership");
  Check((await AdminData($"/api/activations?batchId={historicalBatchId}")).EnumerateArray().All(s=>s.GetProperty("batchId").GetInt32()==historicalBatchId),"historical report enrollment source uses only its explicitly selected batch");
  Check((await AdminData($"/api/applicants/stats?batchId={historicalBatchId}")).GetProperty("releasedDocuments").GetInt32()>0 && (await AdminData($"/api/applicants/stats?batchId={currentBatchId}")).GetProperty("releasedDocuments").GetInt32()==0,"explicit historical dashboard summary does not contaminate current counters");
  Check((await AdminData($"/api/document-requests/dashboard?batchId={historicalBatchId}")).GetProperty("released").GetInt32()>0 && (await AdminData("/api/document-requests/dashboard")).GetProperty("released").GetInt32()==0,"document summaries honor selected and default batch scopes independently");
  Check((await AdminData($"/api/courses/{courseId}/students?batchId={historicalBatchId}")).EnumerateArray().All(s=>s.GetProperty("batchId").GetInt32()==historicalBatchId),"historical course registry honors explicit batch selection");
  using var denied=await admin.PutAsync($"/api/applicants/{applicantId}/status",new StringContent("{\"status\":\"Rejected\"}",System.Text.Encoding.UTF8,"application/json"));
  Check(denied.StatusCode==System.Net.HttpStatusCode.Conflict,"HTTP admin general write to completed batch rejected");
  using var student=https.Client(anonymous.BaseAddress!);
  using var completedLogin=await student.PostAsync("/api/auth/student-login",new StringContent(JsonSerializer.Serialize(new {securityPin=originalPin}),System.Text.Encoding.UTF8,"application/json"));
  using var completedLoginBody=JsonDocument.Parse(await completedLogin.Content.ReadAsStringAsync());
  Check(completedLoginBody.RootElement.GetProperty("success").GetBoolean(),"HTTP historical PIN remains valid after startup with repeat enrollment");
  Check((await student.GetAsync($"/api/student/{studentId}/dashboard")).IsSuccessStatusCode,"HTTP completed student dashboard remains available");
  Check((await student.GetAsync($"/api/student/{studentId}/schedule")).StatusCode==System.Net.HttpStatusCode.Forbidden,"HTTP completed training schedule data denied");
  Check((await student.GetAsync("/Views/Student/ClassSchedule.html")).StatusCode==System.Net.HttpStatusCode.Redirect,"HTTP completed training schedule page redirects");
  Check((await student.GetAsync($"/api/document-requests/student/{studentId}/catalog")).IsSuccessStatusCode,"HTTP completed student individual catalog available");
  Check((await student.GetAsync($"/api/student/{studentId+1000}/profile")).StatusCode==System.Net.HttpStatusCode.Forbidden,"HTTP other-student profile denied");
  using var selfCertify=await student.PutAsync($"/api/course-documents/student/{studentId}/eligibility",new StringContent("{\"feesPaid\":true}",System.Text.Encoding.UTF8,"application/json"));
  Check(selfCertify.StatusCode==System.Net.HttpStatusCode.Forbidden,"HTTP student self-verification denied");
  Check((await student.GetAsync($"/api/course-documents/student/{studentId}")).IsSuccessStatusCode,"HTTP completed student released document catalog available");
  var bytes=await student.GetByteArrayAsync($"/api/document-requests/{requestId}/file");
  Check(bytes.SequenceEqual(expected),"HTTP owner downloads unchanged released bytes after completion");
  Check((await anonymous.GetAsync($"/api/document-requests/{requestId}/file")).StatusCode==System.Net.HttpStatusCode.Unauthorized,"HTTP anonymous released download denied");
  using var activeStudent=https.Client(anonymous.BaseAddress!);
  using var activeLogin=await activeStudent.PostAsync("/api/auth/student-login",new StringContent(JsonSerializer.Serialize(new {username=VerificationAccounts.StudentUsername,password=VerificationAccounts.Password}),System.Text.Encoding.UTF8,"application/json"));
  using var activeLoginBody=JsonDocument.Parse(await activeLogin.Content.ReadAsStringAsync());
  Check(activeLogin.IsSuccessStatusCode && activeLoginBody.RootElement.GetProperty("success").GetBoolean(),"HTTP active student login succeeds: "+activeLoginBody.RootElement.GetProperty("message").GetString());
  using var activeSchedule=await activeStudent.GetAsync($"/api/student/{activeStudentId}/schedule");
  Check(activeSchedule.IsSuccessStatusCode,"HTTP active student retains schedule API access ("+activeSchedule.StatusCode+")");
  using var activePage=await activeStudent.GetAsync("/Views/Student/ClassSchedule.html");
  Check(activePage.IsSuccessStatusCode,"HTTP active student retains schedule page access ("+activePage.StatusCode+")");
  Check((await activeStudent.GetAsync($"/api/document-requests/{requestId}/file")).StatusCode==System.Net.HttpStatusCode.Forbidden,"HTTP another authenticated student cannot download historical released file");
  Check((await activeStudent.GetAsync($"/api/course-documents/{previewDocumentId}/file?inline=true")).StatusCode==System.Net.HttpStatusCode.Forbidden,"Another student's direct preview navigation cannot bypass document ownership");
  Check((await activeStudent.GetAsync("/api/training-rooms")).StatusCode==System.Net.HttpStatusCode.Forbidden,"HTTP student cannot administer training rooms");

  // Exercise both public registration routes through HTTP, including the wizard upload shape.
  anonymous.DefaultRequestHeaders.Remove("X-Abec-Admin-Id");
  var historyBefore=(await AdminData($"/api/applicants?batchId={historicalBatchId}")).GetRawText();
  for(var mode=0;mode<2;mode++) {
   var dto=RegistrationFixture(courseId,$"http.registration{mode}@example.invalid",$"0912345600{mode}");
   dto.CredentialDocumentTypes=SystemConstants.RegistrationChoices.CredentialDocumentTypes.ToList();
   var node=JsonSerializer.SerializeToNode(dto)!;
   node["batchId"]=historicalBatchId; // Caller input must never choose the enrollment batch.
   var payload=node.ToJsonString();
   if(mode==0) {
    using var wrongContext=await anonymous.PostAsync($"/api/applicants/enroll?batchId={historicalBatchId}",new StringContent(payload,System.Text.Encoding.UTF8,"application/json"));
    Check(wrongContext.StatusCode==System.Net.HttpStatusCode.Conflict,"HTTP registration rejects a forged historical query batch before inserting");
   }
   HttpResponseMessage registration;
   if(mode==0) registration=await anonymous.PostAsync("/api/applicants/enroll",new StringContent(payload,System.Text.Encoding.UTF8,"application/json"));
   else {
    using var form=new MultipartFormDataContent();form.Add(new StringContent(payload),"data");
    foreach(var label in dto.CredentialDocumentTypes) {
     var file=new ByteArrayContent(System.Text.Encoding.ASCII.GetBytes("%PDF-1.4\nverification fixture\n%%EOF"));
     file.Headers.ContentType=new System.Net.Http.Headers.MediaTypeHeaderValue("application/pdf");form.Add(file,"credentialFiles",label+".pdf");
    }
    var identity=new ByteArrayContent(System.Text.Encoding.ASCII.GetBytes("%PDF-1.4\nverification identity\n%%EOF"));identity.Headers.ContentType=new System.Net.Http.Headers.MediaTypeHeaderValue("application/pdf");form.Add(identity,"identityFile","identity.pdf");
    registration=await anonymous.PostAsync("/api/applicants/enroll/files",form);
   }
   using(registration) {
    using var body=JsonDocument.Parse(await registration.Content.ReadAsStringAsync());
    Check(registration.IsSuccessStatusCode && body.RootElement.GetProperty("success").GetBoolean(),"HTTP public registration succeeds for "+(mode==0?"JSON":"wizard multipart upload")+": "+body.RootElement.GetProperty("message").GetString());
    var data=body.RootElement.GetProperty("data");var registeredId=data.GetProperty("applicantId").GetInt32();
    Check(data.GetProperty("batchId").GetInt32()==currentBatchId && data.GetProperty("applicationStatus").GetString()=="Pending","HTTP server ignores a forged body batch and assigns the active batch as Pending");
    Check((await AdminData($"/api/applicants/{registeredId}?batchId={currentBatchId}")).GetProperty("batchId").GetInt32()==currentBatchId,"HTTP saved applicant remains in the active batch");
    if(mode==1) Check((await AdminData($"/api/applicants/{registeredId}/registration-documents?batchId={currentBatchId}")).GetArrayLength()==5,"HTTP wizard stores all four credentials and identity document under its active-batch applicant");
   }
  }
  var registeredStats=await AdminData("/api/applicants/stats");
  Check(registeredStats.GetProperty("totalApplicants").GetInt32()==3 && registeredStats.GetProperty("pending").GetInt32()==2,"HTTP public registrations increase only current-batch dashboard counters");
  Check((await AdminData($"/api/applicants?batchId={historicalBatchId}")).GetRawText()==historyBefore,"HTTP public registrations preserve every returned historical applicant field");

  using(var changed=await admin.PostAsync($"/api/admin/profile/{adminId}/change-password",new StringContent(JsonSerializer.Serialize(new {currentPassword=VerificationAccounts.Password,newPassword=Guid.NewGuid().ToString("N")}),System.Text.Encoding.UTF8,"application/json"))) {
   using var result=JsonDocument.Parse(await changed.Content.ReadAsStringAsync());
   Check(changed.IsSuccessStatusCode && result.RootElement.GetProperty("success").GetBoolean(),"HTTP admin password change succeeds");
  }
  Check((await admin.GetAsync("/api/batches")).IsSuccessStatusCode,"Password change refreshes the current browser session");
  Check((await oldSession.GetAsync("/api/batches")).StatusCode==System.Net.HttpStatusCode.Unauthorized,"Password change invalidates previously copied session cookies");
  // A burst must fit inside one limiter window, including on a slow verification host.
  var attempts=await Task.WhenAll(Enumerable.Range(0,20).Select(async _ => {
   using var response=await anonymous.PostAsync("/api/auth/admin-login",new StringContent("{\"username\":\"invalid\",\"password\":\"invalid\"}",System.Text.Encoding.UTF8,"application/json"));
   return response.StatusCode;
  }));
  Check(attempts.Contains(System.Net.HttpStatusCode.TooManyRequests),"HTTP repeated admin sign-in attempts are rate limited");

 }
 finally {
  if(!process.HasExited){process.Kill(true);await process.WaitForExitAsync();}
  var output=await stdout;var errors=await stderr;
  Check(!output.Contains(privateLinkToken,StringComparison.Ordinal) && !errors.Contains(privateLinkToken,StringComparison.Ordinal),"Production framework request logs do not expose slot-link bearer tokens");
 }
}

static async Task VerifyFreshMigration(MySqlConnection source,string namePrefix,string originalConnection)
{
 var name=namePrefix+"_fresh";
 if(!System.Text.RegularExpressions.Regex.IsMatch(name,"^abec_batch_verify_[a-f0-9]{32}_fresh$"))throw new Exception("Unsafe fresh test target");
 await using(var cmd=new MySqlCommand($"CREATE DATABASE `{name}` CHARACTER SET utf8mb4",source))await cmd.ExecuteNonQueryAsync();
 try {
  var cs=new MySqlConnectionStringBuilder(originalConnection){Database=name}.ConnectionString;
  var options=new DbContextOptionsBuilder<ApplicationDbContext>().UseMySql(cs,new MySqlServerVersion(new Version(8,0,36))).Options;
  await using var db=new ApplicationDbContext(options);
  var migrator=db.GetService<Microsoft.EntityFrameworkCore.Migrations.IMigrator>();
  await migrator.MigrateAsync("20261107031554_InitialCreate");
  await db.Database.ExecuteSqlRawAsync("INSERT INTO courses(course_id,course_name,duration,hours_per_day,total_hours,training_days,ojt_days,status,slot_capacity) VALUES(1,'Legacy course','35 days',8,280,35,0,'Available',25)");
  await db.Database.ExecuteSqlRawAsync("INSERT INTO batches(batch_id,batch_name,start_date,end_date,status) VALUES(1,'Legacy completed','2025-01-01','2025-03-01','Closed')");
  await db.Database.ExecuteSqlRawAsync("INSERT INTO batchhistory(batch_id,action,action_date) VALUES(1,'Batch Completed','2025-03-02')");
  await db.Database.ExecuteSqlRawAsync("INSERT INTO applicants(applicant_id,first_name,last_name,gender,birthdate,age,contact_number,email,address,course_id,batch_id,application_status,application_date) VALUES(1,'Legacy','Record','Male','2000-01-01',25,'09123456789','legacy@example.invalid','Legacy address',1,1,'Confirmed Slot','2025-01-01')");
  await db.Database.ExecuteSqlRawAsync("INSERT INTO students(student_id,applicant_id,batch_id,security_pin,account_status,created_at) VALUES(1,1,1,'legacy-pin','Active','2025-01-01')");
  await db.Database.ExecuteSqlRawAsync("INSERT INTO documentrequests(student_id,document_type,reason,request_status,request_date,release_stored_path,release_file_name) VALUES(1,'Payment Receipt','Legacy','Released','2025-01-01','1/preserved.pdf','preserved.pdf')");
  await db.Database.ExecuteSqlRawAsync("INSERT INTO student_course_documents(student_id,course_id,batch_id,document_type,preparation_status,stored_path) VALUES(1,1,NULL,'Payment Receipt','Released','1/course-preserved.pdf')");
  await db.Database.ExecuteSqlRawAsync("INSERT INTO applicants(applicant_id,first_name,last_name,gender,birthdate,age,contact_number,email,address,course_id,batch_id,application_status,application_date) VALUES(2,'Duplicate','Fixture','Male','2000-01-01',25,'+639123456789','duplicate@example.invalid','Test',1,1,'Pending','2025-01-01')");
  await db.Database.ExecuteSqlRawAsync("UPDATE applicants SET batch_id=NULL WHERE applicant_id=2");
  var unassignedRejected=false;try {await db.Database.MigrateAsync();}catch(MySqlException ex) when(ex.Number==3819){unassignedRejected=true;}
  Check(unassignedRejected,"migration stops on unverified legacy ownership instead of assigning an arbitrary batch");
  await db.Database.ExecuteSqlRawAsync("UPDATE applicants SET batch_id=1 WHERE applicant_id=2"); // verified synthetic fixture only
  // A current batch must never receive a grandfathered contact exception.
  await db.Database.ExecuteSqlRawAsync("UPDATE batches SET status='Active' WHERE batch_id=1");
  var rejected=false;try {await db.Database.MigrateAsync();}catch(MySqlException ex) when(ex.Number==3819){rejected=true;}
  Check(rejected,"migration rejects normalized duplicates in an active batch before schema changes");
  await using(var inspect=new MySqlConnection(cs)) {
   await inspect.OpenAsync();await using var count=new MySqlCommand("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='batches' AND COLUMN_NAME='completed_at'",inspect);
   Check(Convert.ToInt32(await count.ExecuteScalarAsync())==0,"failed migration preflight performs no permanent schema changes");
  }
  await db.Database.ExecuteSqlRawAsync("UPDATE batches SET status='Closed' WHERE batch_id=1");
  await db.Database.MigrateAsync();
  await db.Database.OpenConnectionAsync();
  foreach (var sql in BatchLifecycleUpgrade.Statements) await db.Database.ExecuteSqlRawAsync(sql);
  await DbSeeder.EnsureBatchIntegritySchemaAsync(db);
  await db.Database.CloseConnectionAsync();
  var historical=await db.Applicants.OrderBy(a=>a.ApplicantId).ToListAsync();
  Check(historical.Count==2 && historical[0].ContactNumber=="09123456789" && historical[1].ContactNumber=="+639123456789","repeated migration and startup preserve original historical shared phone values and IDs");
  Check(!db.Entry(historical[0]).Property<bool>("LegacyContactConflict").CurrentValue && db.Entry(historical[1]).Property<bool>("LegacyContactConflict").CurrentValue,"only redundant completed contact receives explicit historical exception; primary contact stays indexed");
  db.Entry(historical[1]).Property<bool>("LegacyContactConflict").CurrentValue=false;
  await Reject(async()=>await db.SaveChangesAsync(),"historical contact exception cannot be changed through application writes");db.ChangeTracker.Clear();
  var active=new Batch {BatchName="New contact cycle",StartDate=DateTime.Today,EndDate=DateTime.Today.AddDays(30),Status="Active"};
  db.Batches.Add(active);await db.SaveChangesAsync();
  var bypass=new Applicant {FirstName="Test",LastName="Bypass",Email="bypass@example.invalid",ContactNumber="09111111111",Address="Test",Gender="Male",Birthdate=new DateTime(2000,1,1),Age=26,CourseId=1,BatchId=active.BatchId};
  db.Applicants.Add(bypass);db.Entry(bypass).Property<bool>("LegacyContactConflict").CurrentValue=true;
  await Reject(async()=>await db.SaveChangesAsync(),"new applicant cannot opt out of contact uniqueness using historical metadata");db.ChangeTracker.Clear();
  await using(var direct=new MySqlConnection(cs)) {
   await direct.OpenAsync();
   await using var add=new MySqlCommand($"INSERT INTO applicants(first_name,last_name,gender,birthdate,age,contact_number,email,address,course_id,batch_id,application_status,application_date) VALUES('Race','One','Male','2000-01-01',26,'09123456789','race1@example.invalid','Test',1,{active.BatchId},'Pending',NOW())",direct);await add.ExecuteNonQueryAsync();
   add.CommandText=$"INSERT INTO applicants(first_name,last_name,gender,birthdate,age,contact_number,email,address,course_id,batch_id,application_status,application_date) VALUES('Race','Two','Male','2000-01-01',26,'+639123456789','race2@example.invalid','Test',1,{active.BatchId},'Pending',NOW())";
   var blocked=false;try {await add.ExecuteNonQueryAsync();}catch(MySqlException ex) when(ex.Number==1062){blocked=true;}
   Check(blocked,"database unique index still blocks normalized duplicate contacts for new batches independently of application validation");
  }
  var batch=await db.Batches.SingleAsync(b=>b.BatchId==1);var request=await db.DocumentRequests.SingleAsync();
  Check(batch.Status=="Completed" && batch.CompletedAt==new DateTime(2025,3,2),"EF upgrade preserves and derives historical completion date");
  Check(request.ReleaseStoredPath=="1/preserved.pdf" && request.ReleaseFileName=="preserved.pdf" && await db.Students.CountAsync()==1,"EF upgrade preserves enrollment and released file metadata");
  Check((await db.StudentCourseDocuments.SingleAsync()).BatchId==1 && (await db.StudentCourseDocuments.SingleAsync()).StoredPath=="1/course-preserved.pdf","legacy document batch is recovered from enrollment without changing released path");
  Check(await db.StudentDocumentEligibilities.CountAsync()==0,"migration never invents fee or individual completion eligibility");
  Check((await db.Database.GetAppliedMigrationsAsync()).Count()==2,"fresh installation and subsequent EF migration history verified");
 }
 finally {MySqlConnection.ClearAllPools();await using var drop=new MySqlCommand($"DROP DATABASE `{name}`",source);await drop.ExecuteNonQueryAsync();}
}
static EnrollApplicantDto RegistrationFixture(int courseId,string mail,string phone) => new EnrollApplicantDto {FirstName="Batch",LastName="Verification",Email=mail,ContactNumber=phone,CourseId=courseId,Province="Albay",CityMunicipality="Legazpi",Barangay="Verification",StreetDetails="Verification Street",Gender="Male",Birthdate=DateTime.Today.AddYears(-25),Age=25,PrivacyNoticeAcknowledged=true,SchoolName="N/A",SchoolAddress="N/A",QualificationType=SystemConstants.RegistrationChoices.QualificationTypes[0],ApplicantClassification=SystemConstants.RegistrationChoices.Classifications[0],CivilStatus=SystemConstants.RegistrationChoices.CivilStatuses[0],BirthPlace="Legazpi",Telephone="N/A",Fax="N/A",EducationLevel=SystemConstants.RegistrationChoices.EducationLevels[0],EmploymentStatus=SystemConstants.RegistrationChoices.EmploymentStatuses[0],AddressDistrict="N/A",AddressRegion=SystemConstants.RegistrationChoices.Regions[0].Name,ZipCode="4500",IdentityIdType=SystemConstants.IdentityIdTypes.All[0]};

static void Check(bool ok,string label) { if(!ok) throw new Exception("FAIL "+label);Console.WriteLine("PASS "+label); }
static async Task Reject(Func<Task> action,string label) {try {await action();}catch(BatchIntegrityException) {Check(true,label);return;}throw new Exception("FAIL "+label);}
sealed class TestEmail:IEmailService {public Task<EmailSendResult> SendAsync(string toEmail,string subject,string htmlBody,byte[]? pdfAttachment=null,string? attachmentFileName=null,CancellationToken cancellationToken=default)=>Task.FromResult(EmailSendResult.Skip("Integration test: no external mail"));}
sealed class TestPdf:IPdfService {public byte[] GenerateApplicationFormPdf(Applicant a)=>[];public byte[] GenerateActivationNoticePdf(Student s)=>[];}
sealed class TestOptions:IOptionsMonitor<AppSettings> {public AppSettings CurrentValue {get;}=new();public AppSettings Get(string? name)=>CurrentValue;public IDisposable? OnChange(Action<AppSettings,string?> listener)=>null;}
sealed class TestEnvironment:IWebHostEnvironment {public string EnvironmentName{get;set;}="Development";public string ApplicationName{get;set;}="BatchVerification";public string WebRootPath{get;set;}=Directory.GetCurrentDirectory();public IFileProvider WebRootFileProvider{get;set;}=new NullFileProvider();public string ContentRootPath{get;set;}=Directory.GetCurrentDirectory();public IFileProvider ContentRootFileProvider{get;set;}=new NullFileProvider();}
