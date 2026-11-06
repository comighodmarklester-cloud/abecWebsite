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
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;
using MySqlConnector;

var config = JsonDocument.Parse(File.ReadAllText("appsettings.json"));
var connection = config.RootElement.GetProperty("ConnectionStrings").GetProperty("DefaultConnection").GetString()!;
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
 await DbSeeder.EnsureBatchIntegritySchemaAsync(db);
 await DbSeeder.EnsureBatchIntegritySchemaAsync(db); // upgrade must be repeatable
 var notices = new NotificationService(db);
 var env = new TestEnvironment { ContentRootPath = Path.Combine(Directory.GetCurrentDirectory(), "App_Data", "batch-verification-files", testName) };
 var email = new TestEmail();
 var pdf = new TestPdf();
 var accessor = new HttpContextAccessor { HttpContext = new DefaultHttpContext() };
 var archiveService = new ArchiveService(db, notices);
 var applicantService = new ApplicantService(db, notices, email, pdf, new TestOptions(), accessor, new ApplicantRegistrationStorageService(db, env));
 var activationService = new ActivationService(db, notices, pdf, archiveService);
 var requests = new DocumentRequestService(db, notices, email, env);
 var courseDocuments = new CourseDocumentService(db, notices, env);
 var batches = new BatchService(db);
 var snapshots = new BatchDocumentService(batches, applicantService, activationService, requests, archiveService);
 var course = new Course { CourseName = "Computer Systems Servicing NC II", Duration = "35 days", Status = "Available", SlotCapacity = 2 };
 var admin = new Admin { Username = "verification", Password = "test-only", CreatedAt = DateTime.Now };
 db.AddRange(course, admin); await db.SaveChangesAsync();
 var first = await batches.CreateAsync(new CreateBatchDto { BatchName = "Verification first", StartDate = DateTime.Today.AddDays(1), EndDate = DateTime.Today.AddDays(60), ActivateNow = true, ConfirmSwitch = true });
 Check(first.Success, "create and activate first batch");
 var oldId = first.Data!.BatchId;
 var firstEntity = await db.Batches.FindAsync(oldId); firstEntity!.StartDate = DateTime.Today.AddYears(-1); firstEntity.EndDate = DateTime.Today.AddMonths(-6); await db.SaveChangesAsync();
 var oldApplicant = await Register("batch.verify@example.com", "09123456789");
 oldApplicant.ApplicationStatus = "Confirmed Slot"; oldApplicant.ConfirmedAt = DateTime.Now; await db.SaveChangesAsync();
 var oldStudent = new Student { ApplicantId = oldApplicant.ApplicantId, BatchId = oldId, SecurityPin = "verify-one", AccountStatus = "Active", CreatedAt = DateTime.Now };
 db.Students.Add(oldStudent); await db.SaveChangesAsync();
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
 var before = await db.DocumentRequests.CountAsync();
 var completed = await batches.CompleteAsync(oldId);
 Check(completed.Success && completed.Data!.Status == "Closed" && await db.DocumentRequests.CountAsync() == before, "completion preserves requests and history");
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
 await Reject(async()=> { var s = await db.Students.FindAsync(oldStudent.StudentId); db.Students.Remove(s!); await db.SaveChangesAsync(); }, "historical student deletion rejected"); db.ChangeTracker.Clear();
 await Reject(async()=> { db.Applicants.Add(new Applicant { BatchId=oldId, CourseId=course.CourseId, FirstName="New", LastName="Person", Gender="Male", ContactNumber="09123456780", Email="blocked@example.com", Address="Verification" }); await db.SaveChangesAsync(); }, "historical applicant creation rejected"); db.ChangeTracker.Clear();
 var second = await batches.CreateAsync(new CreateBatchDto { BatchName="Verification second", StartDate=DateTime.Today.AddDays(1), EndDate=DateTime.Today.AddDays(90), ActivateNow=true, ConfirmSwitch=true });
 Check(second.Success, "new active batch created"); var newId = second.Data!.BatchId;
 var fresh = await snapshots.GetAsync(newId, default);
 Check(fresh.Success && !fresh.Data!.ReadOnly && fresh.Data.Applicants.Count == 0 && fresh.Data.Students.Count == 0 && fresh.Data.Requests.Count == 0 && fresh.Data.Archives.Count == 0, "new batch starts empty");
 var reused = await Register("batch.verify@example.com", "09123456789");
 Check(reused.BatchId == newId, "previous email and contact can be reused through registration service");
 await Reject(async()=> await Register("batch.verify@example.com", "09123456780"), "same-batch email duplicate rejected"); db.ChangeTracker.Clear();
 await Reject(async()=> await Register("other.verify@example.com", "+639123456789"), "same-batch normalized contact duplicate rejected"); db.ChangeTracker.Clear();
 // Verify the database itself, bypassing application validation.
 try {
  await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO applicants(first_name,last_name,gender,birthdate,age,contact_number,email,address,course_id,batch_id,application_status,application_date) VALUES ('Duplicate','Verification','Male','2000-01-01',26,'09123456789','sql.verify@example.com','Verification',{course.CourseId},{newId},'Pending',NOW())");
  throw new Exception("FAIL database unique contact index");
 } catch (MySqlException ex) when (ex.Number == 1062) { Check(true,"database enforces normalized contact uniqueness"); }
 var closed = await snapshots.GetAsync(oldId, default);
 Check(closed.Success && closed.Data!.ReadOnly && closed.Data.Students.Count == 1 && closed.Data.Archives.Count == 1 && closed.Data.Requests.Count == 1 && closed.Data.Applicants.All(a=>a.BatchId==oldId), "completed snapshot separates all historical records");
 var filter = new BatchWriteFilter(db);
 await Reject(async()=>await Invoke("DocumentRequest", new Dictionary<string,object?> { ["studentId"]=oldStudent.StudentId }, new ClaimsPrincipal(), async()=> { await requests.CreateAsync(oldStudent.StudentId,new CreateDocumentRequestDto {DocumentType="Certificate of Completion",Reason="Verification"}); }), "anonymous historical document submission rejected");
 var studentUser = new ClaimsPrincipal(new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier,oldStudent.StudentId.ToString()), new Claim(ClaimTypes.Role,"Student") }, "StudentSession"));
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
 Console.WriteLine("ALL BATCH INTEGRATION CHECKS PASSED");
 if(args.Contains("--serve")) {
  var start=new System.Diagnostics.ProcessStartInfo("dotnet") {UseShellExecute=false,CreateNoWindow=true};
  start.ArgumentList.Add(Path.Combine(AppContext.BaseDirectory,"ABEC System.dll"));start.ArgumentList.Add("--urls");start.ArgumentList.Add("http://localhost:5199");
  start.Environment["ConnectionStrings__DefaultConnection"]=testConnection;
  start.Environment["ASPNETCORE_ENVIRONMENT"]="Production";
  using var server=System.Diagnostics.Process.Start(start)!;
  Console.WriteLine("UI verification server: http://localhost:5199/Views/Admin/DocumentManagement.html?batchId="+oldId);
  try {Console.ReadLine();} finally {if(!server.HasExited) {server.Kill(true);await server.WaitForExitAsync();}}
 }

 async Task<Applicant> Register(string mail,string phone) {
  var dto = new EnrollApplicantDto {FirstName="Batch",LastName="Verification",Email=mail,ContactNumber=phone,CourseId=course.CourseId,Province="Albay",CityMunicipality="Legazpi",Barangay="Verification",StreetDetails="Verification Street",Gender="Male",Birthdate=DateTime.Today.AddYears(-25),Age=25,PrivacyNoticeAcknowledged=true,SchoolName="N/A",SchoolAddress="N/A",QualificationType=SystemConstants.RegistrationChoices.QualificationTypes[0],ApplicantClassification=SystemConstants.RegistrationChoices.Classifications[0],CivilStatus=SystemConstants.RegistrationChoices.CivilStatuses[0],BirthPlace="Legazpi",Telephone="N/A",Fax="N/A",EducationLevel=SystemConstants.RegistrationChoices.EducationLevels[0],EmploymentStatus=SystemConstants.RegistrationChoices.EmploymentStatuses[0],AddressDistrict="N/A",AddressRegion=SystemConstants.RegistrationChoices.Regions[0].Name,ZipCode="4500",IdentityIdType=SystemConstants.IdentityIdTypes.All[0]};
  var result=await applicantService.EnrollAsync(dto); if(!result.Success) throw new BatchIntegrityException(result.Message);
  return (await db.Applicants.FindAsync(result.Data!.ApplicantId))!;
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
static void Check(bool ok,string label) { if(!ok) throw new Exception("FAIL "+label);Console.WriteLine("PASS "+label); }
static async Task Reject(Func<Task> action,string label) {try {await action();}catch(BatchIntegrityException) {Check(true,label);return;}throw new Exception("FAIL "+label);}
sealed class TestEmail:IEmailService {public Task<EmailSendResult> SendAsync(string toEmail,string subject,string htmlBody,byte[]? pdfAttachment=null,string? attachmentFileName=null,CancellationToken cancellationToken=default)=>Task.FromResult(EmailSendResult.Skip("Integration test: no external mail"));}
sealed class TestPdf:IPdfService {public byte[] GenerateApplicationFormPdf(Applicant a)=>[];public byte[] GenerateActivationNoticePdf(Student s)=>[];}
sealed class TestOptions:IOptionsMonitor<AppSettings> {public AppSettings CurrentValue {get;}=new();public AppSettings Get(string? name)=>CurrentValue;public IDisposable? OnChange(Action<AppSettings,string?> listener)=>null;}
sealed class TestEnvironment:IWebHostEnvironment {public string EnvironmentName{get;set;}="Development";public string ApplicationName{get;set;}="BatchVerification";public string WebRootPath{get;set;}=Directory.GetCurrentDirectory();public IFileProvider WebRootFileProvider{get;set;}=new NullFileProvider();public string ContentRootPath{get;set;}=Directory.GetCurrentDirectory();public IFileProvider ContentRootFileProvider{get;set;}=new NullFileProvider();}
