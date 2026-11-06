using System.Globalization;
using ABEC_System.Constants;
using ABEC_System.Data;
using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using ABEC_System.Models;
using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Services;

public class CourseDocumentService : ICourseDocumentService
{
    private readonly ApplicationDbContext _db;
    private readonly INotificationService _notifications;
    private readonly IWebHostEnvironment _env;

    public CourseDocumentService(
        ApplicationDbContext db,
        INotificationService notifications,
        IWebHostEnvironment env)
    {
        _db = db;
        _notifications = notifications;
        _env = env;
    }

    private string StorageRoot =>
        Path.Combine(_env.ContentRootPath, "App_Data", "secure-uploads", "course-documents");

    public async Task<ApiResponse<CourseReleaseBoardDto>> GetBoardAsync(
        int courseId,
        int? batchId,
        CancellationToken cancellationToken = default)
    {
        var course = await _db.Courses.AsNoTracking().FirstOrDefaultAsync(c => c.CourseId == courseId, cancellationToken);
        if (course is null)
            return ApiResponse<CourseReleaseBoardDto>.Fail("Course not found.");

        var archivedIds = await _db.Archives.AsNoTracking()
            .Select(a => a.StudentId)
            .ToListAsync(cancellationToken);
        var archived = archivedIds.ToHashSet();

        var students = await _db.Students.AsNoTracking()
            .Include(s => s.Applicant)
            .Include(s => s.Batch)
            .Where(s => s.Applicant != null && s.Applicant.CourseId == courseId)
            .ToListAsync(cancellationToken);
        students = students.Where(s => !archived.Contains(s.StudentId)).ToList();

        var batchIds = students.Select(s => s.BatchId).Distinct().ToList();
        var scheduleBatchIds = await _db.CourseSchedules.AsNoTracking()
            .Where(s => s.CourseId == courseId)
            .Select(s => s.BatchId)
            .Distinct()
            .ToListAsync(cancellationToken);
        var allBatchIds = batchIds.Concat(scheduleBatchIds).Distinct().ToList();
        var batches = await _db.Batches.AsNoTracking()
            .Where(b => allBatchIds.Contains(b.BatchId))
            .ToListAsync(cancellationToken);

        var options = batches
            .Select(b => new CourseReleaseBatchOptionDto
            {
                BatchId = b.BatchId,
                BatchName = b.BatchName,
                StudentCount = students.Count(s => s.BatchId == b.BatchId)
            })
            .OrderByDescending(b => b.StudentCount)
            .ThenBy(b => b.BatchName)
            .ToList();

        Batch? selected = null;
        if (batchId is > 0)
            selected = batches.FirstOrDefault(b => b.BatchId == batchId);
        if (batchId is > 0 && selected is null)
            selected = await _db.Batches.AsNoTracking().FirstOrDefaultAsync(b => b.BatchId == batchId, cancellationToken);
        if (batchId is > 0 && selected is null) return ApiResponse<CourseReleaseBoardDto>.Fail("Batch not found.");
        selected ??= batches
            .OrderByDescending(b => students.Count(s => s.BatchId == b.BatchId))
            .ThenByDescending(b => b.StartDate)
            .FirstOrDefault();

        var inBatch = selected is null
            ? students
            : students.Where(s => s.BatchId == selected.BatchId).ToList();

        var studentIds = inBatch.Select(s => s.StudentId).ToList();
        var documents = await _db.StudentCourseDocuments.AsNoTracking()
            .Where(d => studentIds.Contains(d.StudentId))
            .ToListAsync(cancellationToken);
        var requests = await _db.DocumentRequests.AsNoTracking()
            .Where(r => studentIds.Contains(r.StudentId))
            .ToListAsync(cancellationToken);

        var timeline = BuildTimeline(course, selected);
        var deadline = timeline.ReleaseDeadline?.Date;
        var today = DateTime.Today;
        var needingPrep = 0;
        var fully = 0;
        var overdue = 0;
        var approaching = 0;

        foreach (var student in inBatch)
        {
            var rows = documents.Where(d => d.StudentId == student.StudentId).ToList();
            var statuses = SystemConstants.DocumentStatuses.PostCourseCredentials
                .Select(type => rows.FirstOrDefault(d => SameType(d.DocumentType, type))?.PreparationStatus
                    ?? SystemConstants.CourseDocumentStatuses.NotPrepared)
                .ToList();
            if (statuses.All(s => s == SystemConstants.CourseDocumentStatuses.Released)) fully++;
            if (statuses.Any(s => s == SystemConstants.CourseDocumentStatuses.NotPrepared)) needingPrep++;
            if (deadline is null) continue;
            foreach (var status in statuses)
            {
                if (status == SystemConstants.CourseDocumentStatuses.Released) continue;
                if (deadline.Value < today) overdue++;
                else if (deadline.Value <= today.AddDays(7)) approaching++;
            }
        }

        var openRequestStatuses = new[]
        {
            SystemConstants.DocumentStatuses.Pending,
            SystemConstants.DocumentStatuses.Processing,
            SystemConstants.DocumentStatuses.OnHold,
            SystemConstants.DocumentStatuses.ReadyForRelease
        };
        var outstanding = requests.Count(r =>
            openRequestStatuses.Contains(r.RequestStatus, StringComparer.OrdinalIgnoreCase)
            && SystemConstants.DocumentStatuses.PostCourseCredentials.Any(type => SameType(r.DocumentType, type)));

        var board = new CourseReleaseBoardDto
        {
            Timeline = timeline,
            Batches = options,
            EnrolledStudents = inBatch.Count,
            StudentsRequiringPreparation = needingPrep,
            StudentsFullyReleased = fully,
            StudentsPending = inBatch.Count - fully,
            OutstandingRequests = outstanding,
            OverdueDocuments = overdue,
            ApproachingDocuments = approaching
        };
        return ApiResponse<CourseReleaseBoardDto>.Ok(board);
    }

    public async Task<ApiResponse<StudentCourseReleaseDto>> GetStudentReleaseAsync(
        int studentId,
        CancellationToken cancellationToken = default)
    {
        var student = await _db.Students
            .Include(s => s.Applicant)!.ThenInclude(a => a!.Course)
            .Include(s => s.Batch)
            .FirstOrDefaultAsync(s => s.StudentId == studentId, cancellationToken);
        if (student?.Applicant is null)
            return ApiResponse<StudentCourseReleaseDto>.Fail("Student not found.");

        var rows = student.Batch?.Status == "Active"
            ? await EnsureDocumentsAsync(student, cancellationToken)
            : await _db.StudentCourseDocuments.AsNoTracking().Where(d => d.StudentId == studentId).ToListAsync(cancellationToken);
        var timeline = BuildTimeline(student.Applicant.Course, student.Batch);
        var pack = new StudentCourseReleaseDto
        {
            Timeline = timeline,
            Documents = rows.Select(row => MapDocument(row, timeline)).ToList()
        };
        return ApiResponse<StudentCourseReleaseDto>.Ok(pack);
    }

    public async Task<ApiResponse<StudentCourseDocumentDto>> UploadAsync(
        int courseDocumentId,
        IFormFile file,
        int? adminId,
        CancellationToken cancellationToken = default)
    {
        if (!await IsAdminAsync(adminId, cancellationToken))
            return ApiResponse<StudentCourseDocumentDto>.Fail("Administrator permission is required to upload this document.");
        if (file is null)
            return ApiResponse<StudentCourseDocumentDto>.Fail("Choose a file to upload.");

        var entity = await _db.StudentCourseDocuments
            .Include(d => d.Student)!.ThenInclude(s => s!.Applicant)!.ThenInclude(a => a!.Course)
            .Include(d => d.Student)!.ThenInclude(s => s!.Batch)
            .FirstOrDefaultAsync(d => d.CourseDocumentId == courseDocumentId, cancellationToken);
        if (entity is null)
            return ApiResponse<StudentCourseDocumentDto>.Fail("Course document not found.");
        if (entity.PreparationStatus == SystemConstants.CourseDocumentStatuses.Released)
            return ApiResponse<StudentCourseDocumentDto>.Fail("This document has already been released and its file can no longer be replaced.");

        await _db.RequireActiveBatchAsync(entity.BatchId, cancellationToken);
        var validation = await ValidateFileAsync(file, cancellationToken);
        if (validation is not null)
            return ApiResponse<StudentCourseDocumentDto>.Fail(validation);

        var dir = Path.Combine(StorageRoot, entity.StudentId.ToString(), entity.CourseDocumentId.ToString());
        Directory.CreateDirectory(dir);
        DeleteStoredFile(entity.StoredPath);

        var safeOriginal = Path.GetFileName(file.FileName);
        var ext = Path.GetExtension(safeOriginal).ToLowerInvariant();
        var storedName = $"{Guid.NewGuid():N}{ext}";
        var fullPath = Path.Combine(dir, storedName);
        await using (var stream = new FileStream(fullPath, FileMode.Create))
            await file.CopyToAsync(stream, cancellationToken);

        entity.FileName = safeOriginal;
        entity.StoredPath = Path.Combine(entity.StudentId.ToString(), entity.CourseDocumentId.ToString(), storedName).Replace('\\', '/');
        entity.ContentType = ContentTypeFor(ext);
        entity.SizeBytes = file.Length;
        entity.UploadedAt = DateTime.Now;
        entity.PreparationStatus = SystemConstants.CourseDocumentStatuses.ReadyForRelease;
        entity.CourseId = entity.Student?.Applicant?.CourseId ?? entity.CourseId;
        entity.BatchId = entity.Student?.BatchId ?? entity.BatchId;
        await _db.SaveChangesAsync(cancellationToken);

        var timeline = BuildTimeline(entity.Student?.Applicant?.Course, entity.Student?.Batch);
        return ApiResponse<StudentCourseDocumentDto>.Ok(MapDocument(entity, timeline), "Document uploaded. It is ready for release.");
    }

    public async Task<ApiResponse<StudentCourseDocumentDto>> ReleaseAsync(
        int courseDocumentId,
        int? adminId,
        CancellationToken cancellationToken = default)
    {
        if (!await IsAdminAsync(adminId, cancellationToken))
            return ApiResponse<StudentCourseDocumentDto>.Fail("Administrator permission is required to release this document.");

        var entity = await _db.StudentCourseDocuments
            .Include(d => d.Student)!.ThenInclude(s => s!.Applicant)!.ThenInclude(a => a!.Course)
            .Include(d => d.Student)!.ThenInclude(s => s!.Batch)
            .FirstOrDefaultAsync(d => d.CourseDocumentId == courseDocumentId, cancellationToken);
        if (entity is null)
            return ApiResponse<StudentCourseDocumentDto>.Fail("Course document not found.");
        if (entity.PreparationStatus == SystemConstants.CourseDocumentStatuses.Released)
            return ApiResponse<StudentCourseDocumentDto>.Ok(MapDocument(entity, BuildTimeline(entity.Student?.Applicant?.Course, entity.Student?.Batch)), "This document is already released.");
        if (string.IsNullOrWhiteSpace(entity.StoredPath) || entity.PreparationStatus != SystemConstants.CourseDocumentStatuses.ReadyForRelease)
            return ApiResponse<StudentCourseDocumentDto>.Fail("Upload the document before releasing it.");

        var now = DateTime.Now;
        entity.PreparationStatus = SystemConstants.CourseDocumentStatuses.Released;
        entity.ReleasedAt = now;
        entity.ReleasedByUserId = adminId;

        var openStatuses = new[]
        {
            SystemConstants.DocumentStatuses.Pending,
            SystemConstants.DocumentStatuses.Processing,
            SystemConstants.DocumentStatuses.OnHold,
            SystemConstants.DocumentStatuses.ReadyForRelease
        };
        var requests = await _db.DocumentRequests
            .Where(r => r.StudentId == entity.StudentId && openStatuses.Contains(r.RequestStatus))
            .ToListAsync(cancellationToken);
        foreach (var request in requests)
        {
            if (!SystemConstants.DocumentStatuses.SameCourseDocument(request.DocumentType, entity.DocumentType)) continue;
            request.RequestStatus = SystemConstants.DocumentStatuses.Released;
            request.ReleaseDate = now;
            request.DocumentType = entity.DocumentType;
        }

        await _db.SaveChangesAsync(cancellationToken);

        try
        {
            await _notifications.CreateAsync(
                "Document Released",
                $"Your {entity.DocumentType} has been released.",
                studentId: entity.StudentId,
                cancellationToken: cancellationToken);
        }
        catch
        {
            // The release itself is already stored.
        }

        var timeline = BuildTimeline(entity.Student?.Applicant?.Course, entity.Student?.Batch);
        return ApiResponse<StudentCourseDocumentDto>.Ok(MapDocument(entity, timeline), "Document released.");
    }

    public async Task<ApiResponse<CourseReleaseTimelineDto>> SetAssessmentDateAsync(
        int batchId,
        DateTime? assessmentDate,
        CancellationToken cancellationToken = default)
    {
        await _db.RequireActiveBatchAsync(batchId, cancellationToken);
        var batch = await _db.Batches.FirstOrDefaultAsync(b => b.BatchId == batchId, cancellationToken);
        if (batch is null)
            return ApiResponse<CourseReleaseTimelineDto>.Fail("Batch not found.");

        var previous = batch.AssessmentDate?.Date;
        var next = assessmentDate?.Date;
        batch.AssessmentDate = next;
        if (previous != next)
        {
            var note = next is null
                ? "Assessment date cleared"
                : "Assessment date set to " + next.Value.ToString("yyyy-MM-dd");
            if (previous is not null && next is not null)
                note = "Assessment " + previous.Value.ToString("yyyy-MM-dd") + " to " + next.Value.ToString("yyyy-MM-dd");
            _db.BatchHistories.Add(new BatchHistory
            {
                BatchId = batch.BatchId,
                Action = note.Length > 100 ? note[..100] : note,
                ActionDate = DateTime.Now
            });
        }
        await _db.SaveChangesAsync(cancellationToken);

        var course = await _db.Students.AsNoTracking()
            .Where(s => s.BatchId == batchId && s.Applicant != null)
            .Select(s => s.Applicant!.Course)
            .FirstOrDefaultAsync(cancellationToken);
        return ApiResponse<CourseReleaseTimelineDto>.Ok(BuildTimeline(course, batch), "Assessment date saved.");
    }

    public async Task<(Stream? Stream, string? ContentType, string? FileName, string? Error)> OpenFileAsync(
        int courseDocumentId,
        int? studentId,
        int? adminId,
        CancellationToken cancellationToken = default)
    {
        var entity = await _db.StudentCourseDocuments.AsNoTracking()
            .FirstOrDefaultAsync(d => d.CourseDocumentId == courseDocumentId, cancellationToken);
        if (entity is null || string.IsNullOrWhiteSpace(entity.StoredPath))
            return (null, null, null, "No file is stored for this document.");

        var isAdmin = await IsAdminAsync(adminId, cancellationToken);
        var released = entity.PreparationStatus == SystemConstants.CourseDocumentStatuses.Released;
        if (!released && !isAdmin)
            return (null, null, null, "This document has not been released.");
        if (!isAdmin && studentId != entity.StudentId)
            return (null, null, null, "You can only open your own released documents.");
        if (studentId is > 0 && studentId != entity.StudentId)
            return (null, null, null, "You can only open your own released documents.");

        var root = Path.GetFullPath(StorageRoot);
        var fullPath = Path.GetFullPath(Path.Combine(root, entity.StoredPath.Replace('/', Path.DirectorySeparatorChar)));
        if (!fullPath.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || !File.Exists(fullPath))
            return (null, null, null, "The stored file is missing.");

        var stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read);
        return (stream, entity.ContentType, entity.FileName, null);
    }

    private async Task<List<StudentCourseDocument>> EnsureDocumentsAsync(Student student, CancellationToken cancellationToken)
    {
        var existing = await _db.StudentCourseDocuments
            .Where(d => d.StudentId == student.StudentId)
            .ToListAsync(cancellationToken);

        var changed = false;
        foreach (var type in SystemConstants.DocumentStatuses.PostCourseCredentials)
        {
            var row = FindCourseDocument(existing, type);
            if (row is null)
            {
                row = new StudentCourseDocument
                {
                    StudentId = student.StudentId,
                    CourseId = student.Applicant?.CourseId ?? 0,
                    BatchId = student.BatchId,
                    DocumentType = type,
                    PreparationStatus = SystemConstants.CourseDocumentStatuses.NotPrepared
                };
                _db.StudentCourseDocuments.Add(row);
                existing.Add(row);
                changed = true;
                continue;
            }

            if (row.CourseId != (student.Applicant?.CourseId ?? row.CourseId) || row.BatchId != student.BatchId || row.DocumentType != type)
            {
                row.CourseId = student.Applicant?.CourseId ?? row.CourseId;
                row.BatchId = student.BatchId;
                row.DocumentType = type;
                changed = true;
            }
        }

        if (changed)
        {
            try
            {
                await _db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                existing = await _db.StudentCourseDocuments
                    .Where(d => d.StudentId == student.StudentId)
                    .ToListAsync(cancellationToken);
            }
        }

        return SystemConstants.DocumentStatuses.PostCourseCredentials
            .Select(type => FindCourseDocument(existing, type)!)
            .ToList();
    }

    private static CourseReleaseTimelineDto BuildTimeline(Course? course, Batch? batch)
    {
        DateTime? start = batch is null || batch.StartDate.Year < 1900 ? null : batch.StartDate;
        DateTime? end = batch is null || batch.EndDate.Year < 1900 ? null : batch.EndDate;
        // Saved batch dates stay in charge of the release deadline.
        // Course program length is displayed separately and is not written back onto the batch.
        var window = ReleaseDeadline.Compute(start, end, null);
        var assessment = batch?.AssessmentDate;
        var releaseDisplay = LongDate(window.ReleaseDeadline);
        var program = CourseProgram.Match(course?.CourseName);
        var gate = CourseProgram.RequestGate(start, program, DateTime.Today);
        var incomplete = window.Message ?? "The training schedule is incomplete, so a release deadline cannot be calculated.";
        return new CourseReleaseTimelineDto
        {
            CourseId = course?.CourseId,
            CourseName = course?.CourseName ?? string.Empty,
            BatchId = batch?.BatchId,
            BatchName = batch?.BatchName ?? string.Empty,
            TrainingStart = start,
            TrainingStartDisplay = LongDate(start),
            DurationDays = window.DurationDays,
            DurationDisplay = window.DurationDays is > 0 ? $"{window.DurationDays} days" : null,
            CompletionDate = window.CompletionDate,
            CompletionDisplay = LongDate(window.CompletionDate),
            AssessmentDate = assessment,
            AssessmentDisplay = LongDate(assessment),
            ReleaseDeadline = window.ReleaseDeadline,
            ReleaseDeadlineDisplay = releaseDisplay,
            ScheduleComplete = window.IsComplete,
            ExpectedReleaseLabel = window.IsComplete
                ? $"Expected document release: {releaseDisplay}"
                : incomplete,
            StudentReleaseMessage = window.IsComplete
                ? $"Your expected document release date is {releaseDisplay}."
                : incomplete,
            ProgramSummary = program?.Summary,
            RequestsOpen = gate.Open,
            RequestBlockedMessage = gate.Open ? null : gate.Message,
            TrainingCompletionDisplay = LongDate(gate.CompletionDate)
        };
    }

    private static StudentCourseDocumentDto MapDocument(StudentCourseDocument row, CourseReleaseTimelineDto timeline)
    {
        var released = row.PreparationStatus == SystemConstants.CourseDocumentStatuses.Released;
        var deadline = timeline.ReleaseDeadline?.Date;
        var today = DateTime.Today;
        return new StudentCourseDocumentDto
        {
            CourseDocumentId = row.CourseDocumentId,
            StudentId = row.StudentId,
            CourseId = row.CourseId,
            BatchId = row.BatchId,
            DocumentType = row.DocumentType,
            PreparationStatus = row.PreparationStatus,
            FileName = row.FileName,
            HasFile = !string.IsNullOrWhiteSpace(row.StoredPath),
            UploadedAt = row.UploadedAt,
            ReleasedAt = row.ReleasedAt,
            ReleaseDeadlineDisplay = timeline.ReleaseDeadlineDisplay,
            IsOverdue = !released && deadline is not null && deadline.Value < today,
            IsApproaching = !released && deadline is not null && deadline.Value >= today && deadline.Value <= today.AddDays(7)
        };
    }

    private async Task<bool> IsAdminAsync(int? adminId, CancellationToken cancellationToken)
    {
        if (adminId is null or <= 0) return false;
        return await _db.Admins.AsNoTracking().AnyAsync(a => a.AdminId == adminId, cancellationToken);
    }

    private void DeleteStoredFile(string? storedPath)
    {
        if (string.IsNullOrWhiteSpace(storedPath)) return;
        var root = Path.GetFullPath(StorageRoot);
        var fullPath = Path.GetFullPath(Path.Combine(root, storedPath.Replace('/', Path.DirectorySeparatorChar)));
        if (fullPath.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) && File.Exists(fullPath))
            File.Delete(fullPath);
    }

    private static string ContentTypeFor(string ext) => ext switch
    {
        ".pdf" => "application/pdf",
        ".png" => "image/png",
        ".jpg" or ".jpeg" => "image/jpeg",
        _ => "application/octet-stream"
    };

    private static async Task<string?> ValidateFileAsync(IFormFile file, CancellationToken cancellationToken)
    {
        if (file.Length <= 0)
            return "The uploaded file is empty.";
        if (file.Length > SystemConstants.RegistrationUploadLimits.MaxFileBytes)
            return $"Each file must be {SystemConstants.RegistrationUploadLimits.MaxFileBytes / (1024 * 1024)} MB or smaller.";
        var ext = Path.GetExtension(Path.GetFileName(file.FileName)).ToLowerInvariant();
        if (!SystemConstants.RegistrationUploadLimits.AllowedExtensions.Contains(ext))
            return "Allowed file types: PDF, JPG, JPEG, PNG.";
        var header = new byte[8];
        await using var stream = file.OpenReadStream();
        var read = await stream.ReadAsync(header.AsMemory(0, 8), cancellationToken);
        var valid = ext == ".pdf"
            ? read >= 4 && header[0] == (byte)'%' && header[1] == (byte)'P' && header[2] == (byte)'D' && header[3] == (byte)'F'
            : ext is ".jpg" or ".jpeg"
                ? read >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF
                : read >= 8 && header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47;
        return valid ? null : "The uploaded file does not match its file type.";
    }

    private static StudentCourseDocument? FindCourseDocument(List<StudentCourseDocument> existing, string type)
    {
        var exact = existing.FirstOrDefault(d => SameType(d.DocumentType, type));
        if (exact is not null) return exact;
        if (!string.Equals(type, SystemConstants.DocumentStatuses.CertificateOfCompletion, StringComparison.OrdinalIgnoreCase))
            return null;
        // Keep a stored Training Certificate row when it is the only copy of this credential.
        return existing.FirstOrDefault(d => SystemConstants.DocumentStatuses.IsTrainingCertificateAlias(d.DocumentType));
    }

    private static bool SameType(string? left, string? right)
        => string.Equals((left ?? string.Empty).Trim(), (right ?? string.Empty).Trim(), StringComparison.OrdinalIgnoreCase);

    private static string? LongDate(DateTime? value)
        => value is null ? null : value.Value.ToString("MMMM d, yyyy", CultureInfo.InvariantCulture);
}
