using ABEC_System.Constants;
using ABEC_System.Data;
using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using ABEC_System.Models;
using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Services;

public class DocumentRequestService : IDocumentRequestService
{
    private readonly ApplicationDbContext _db;
    private readonly INotificationService _notifications;
    private readonly IEmailService _email;
    private readonly IWebHostEnvironment _env;

    private static readonly Dictionary<string, string> DocumentDescriptions = new(StringComparer.OrdinalIgnoreCase)
    {
        ["National Certificate (TESDA)"] = "TESDA National Certificate issued by ABEC",
        ["Payment Receipt"] = "Official payment receipt for course fees",
        ["Certificate of Completion"] = "Certificate confirming course completion"
    };

    public DocumentRequestService(
        ApplicationDbContext db,
        INotificationService notifications,
        IEmailService email,
        IWebHostEnvironment env)
    {
        _db = db;
        _notifications = notifications;
        _email = email;
        _env = env;
    }

    private string ReleaseRoot =>
        Path.Combine(_env.ContentRootPath, "App_Data", "secure-uploads", "document-requests");

    public async Task<ApiResponse<IReadOnlyList<DocumentRequestDto>>> GetAllAsync(string? status = null, CancellationToken cancellationToken = default, int? batchId = null)
    {
        var query = BaseQuery();
        var selectedBatchId = await _db.ResolveReadBatchIdAsync(batchId, cancellationToken);
        query = query.Where(r => r.Student!.BatchId == selectedBatchId);
        if (!string.IsNullOrWhiteSpace(status) && !string.Equals(status, "all", StringComparison.OrdinalIgnoreCase))
        {
            var normalized = NormalizeStatus(status);
            if (normalized is null)
                return ApiResponse<IReadOnlyList<DocumentRequestDto>>.Fail("Invalid document request status.");
            query = query.Where(r => r.RequestStatus == normalized);
        }

        var list = await query.OrderByDescending(r => r.RequestDate).ToListAsync(cancellationToken);
        var abecOnly = list
            .Select(Map)
            .Where(r => IsAbecProvidedDocument(r.DocumentType))
            .ToList();
        return ApiResponse<IReadOnlyList<DocumentRequestDto>>.Ok(abecOnly);
    }

    public async Task<ApiResponse<DocumentRequestDto>> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        var entity = await BaseQuery().FirstOrDefaultAsync(r => r.RequestId == id, cancellationToken);
        return entity is null
            ? ApiResponse<DocumentRequestDto>.Fail("Document request not found.")
            : ApiResponse<DocumentRequestDto>.Ok(Map(entity));
    }

    public async Task<ApiResponse<IReadOnlyList<DocumentRequestDto>>> GetByStudentAsync(int studentId, CancellationToken cancellationToken = default)
    {
        var list = await BaseQuery()
            .Where(r => r.StudentId == studentId)
            .OrderByDescending(r => r.RequestDate)
            .ToListAsync(cancellationToken);
        var abecOnly = list
            .Select(Map)
            .Where(r => IsAbecProvidedDocument(r.DocumentType))
            .ToList();
        return ApiResponse<IReadOnlyList<DocumentRequestDto>>.Ok(abecOnly);
    }

    public async Task<ApiResponse<IReadOnlyList<StudentDocumentCatalogItemDto>>> GetStudentCatalogAsync(
        int studentId,
        CancellationToken cancellationToken = default)
    {
        var studentExists = await _db.Students.AnyAsync(s => s.StudentId == studentId, cancellationToken);
        if (!studentExists)
            return ApiResponse<IReadOnlyList<StudentDocumentCatalogItemDto>>.Fail("Student not found.");

        return ApiResponse<IReadOnlyList<StudentDocumentCatalogItemDto>>.Ok(await new StudentDocumentCatalog(_db).GetAsync(studentId, cancellationToken));
    }

    public async Task<ApiResponse<DocumentRequestDashboardDto>> GetDashboardAsync(CancellationToken cancellationToken = default, int? batchId = null)
    {
        batchId = await _db.ResolveReadBatchIdAsync(batchId, cancellationToken);
        var all = await BaseQuery().Where(r => r.Student!.BatchId == batchId).ToListAsync(cancellationToken);
        var abecRequests = all
            .Select(Map)
            .Where(r => IsAbecProvidedDocument(r.DocumentType))
            .ToList();

        var summaries = SystemConstants.DocumentStatuses.PostCourseCredentials.Select(docType =>
        {
            var forType = abecRequests
                .Where(r => string.Equals(r.DocumentType, docType, StringComparison.OrdinalIgnoreCase))
                .ToList();
            var releasedCount = forType.Count(r => r.RequestStatus == SystemConstants.DocumentStatuses.Released);
            var notReleasedCount = forType.Count(r => r.RequestStatus != SystemConstants.DocumentStatuses.Released);
            var releaseStatus = releasedCount > 0 && notReleasedCount == 0
                ? "Released"
                : "Not Released";

            return new AbecDocumentReleaseSummaryDto
            {
                DocumentType = docType,
                Description = DocumentDescriptions.GetValueOrDefault(docType, "Document provided by ABEC"),
                ReleasedCount = releasedCount,
                NotReleasedCount = notReleasedCount,
                ReleaseStatus = releaseStatus
            };
        }).ToList();

        var dashboard = new DocumentRequestDashboardDto
        {
            AbecDocuments = summaries,
            Pending = abecRequests.Count(r => r.RequestStatus == SystemConstants.DocumentStatuses.Pending),
            Processing = abecRequests.Count(r => r.RequestStatus == SystemConstants.DocumentStatuses.Processing),
            OnHold = abecRequests.Count(r => r.RequestStatus == SystemConstants.DocumentStatuses.OnHold),
            ReadyForRelease = abecRequests.Count(r => r.RequestStatus == SystemConstants.DocumentStatuses.ReadyForRelease),
            Released = abecRequests.Count(r => r.RequestStatus == SystemConstants.DocumentStatuses.Released)
        };

        return ApiResponse<DocumentRequestDashboardDto>.Ok(dashboard);
    }

    public async Task<ApiResponse<DocumentRequestDto>> CreateAsync(int studentId, CreateDocumentRequestDto dto, CancellationToken cancellationToken = default)
    {
        await using var transaction = await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
        var studentExists = await _db.Students.AnyAsync(s => s.StudentId == studentId, cancellationToken);
        if (!studentExists)
            return ApiResponse<DocumentRequestDto>.Fail("Student not found.");

        var documentType = CanonicalDocumentType(dto.DocumentType);
        if (string.IsNullOrWhiteSpace(documentType))
            return ApiResponse<DocumentRequestDto>.Fail("Document type is required.");

        if (!IsAbecProvidedDocument(documentType))
        {
            return ApiResponse<DocumentRequestDto>.Fail(
                "Only ABEC-provided documents can be requested: National Certificate (TESDA), Payment Receipt, and Certificate of Completion.");
        }

        var eligibility = (await new StudentDocumentCatalog(_db).GetAsync(studentId, cancellationToken))
            .Single(d => SystemConstants.DocumentStatuses.SameCourseDocument(d.DocumentType, documentType));
        if (!eligibility.CanRequest)
            return ApiResponse<DocumentRequestDto>.Fail(eligibility.RequestBlockedMessage ?? "This document cannot be requested.");
        var reason = string.IsNullOrWhiteSpace(dto.Reason) ? "Document request" : dto.Reason.Trim();
        var specific = (dto.SpecificReason ?? string.Empty).Trim();
        if (string.Equals(reason, "Other", StringComparison.OrdinalIgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(specific))
                return ApiResponse<DocumentRequestDto>.Fail("Please specify a reason when selecting Other.");
        }
        else
        {
            specific = string.Empty;
        }

        var entity = new DocumentRequest
        {
            StudentId = studentId,
            DocumentType = documentType,
            Reason = reason,
            SpecificReason = string.IsNullOrWhiteSpace(specific) ? null : specific,
            RequestStatus = SystemConstants.DocumentStatuses.Pending,
            RequestDate = DateTime.Now
        };

        _db.DocumentRequests.Add(entity);
        await _db.SaveChangesAsync(cancellationToken);

        var student = await _db.Students.AsNoTracking()
            .Include(s => s.Applicant)
            .FirstAsync(s => s.StudentId == studentId, cancellationToken);

        await _notifications.CreateAsync(
            "Document Request Submitted",
            $"Your request for {entity.DocumentType} has been submitted and is now Pending.",
            studentId: studentId,
            cancellationToken: cancellationToken);

        await _notifications.CreateAdminAsync(
            "New Document Request",
            $"{student.Applicant?.FullName ?? "A student"} requested {entity.DocumentType}. Request #{entity.RequestId}.",
            student.Applicant?.ApplicantId,
            cancellationToken: cancellationToken, requestId: entity.RequestId);

        var loaded = await BaseQuery().FirstAsync(r => r.RequestId == entity.RequestId, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return ApiResponse<DocumentRequestDto>.Ok(Map(loaded), "Document request submitted.");
    }

    public async Task<ApiResponse<DocumentRequestDto>> UpdateStatusAsync(
        int id,
        string status,
        string? holdReason = null,
        CancellationToken cancellationToken = default)
    {
        var normalized = NormalizeStatus(status);
        if (normalized is null || normalized == SystemConstants.DocumentStatuses.NotRequested)
            return ApiResponse<DocumentRequestDto>.Fail("Invalid document request status.");

        var entity = await _db.DocumentRequests
            .Include(r => r.Student)!.ThenInclude(s => s!.Applicant)!.ThenInclude(a => a!.Course)
            .FirstOrDefaultAsync(r => r.RequestId == id, cancellationToken);
        if (entity is null)
            return ApiResponse<DocumentRequestDto>.Fail("Document request not found.");

        await _db.RequireDocumentWriteAsync(entity.StudentId, cancellationToken);
        var current = NormalizeStatus(entity.RequestStatus) ?? entity.RequestStatus;
        if (string.Equals(current, normalized, StringComparison.OrdinalIgnoreCase))
            return ApiResponse<DocumentRequestDto>.Ok(Map(entity), "This request is already " + normalized + ".");
        if (!IsTransitionAllowed(current, normalized))
            return ApiResponse<DocumentRequestDto>.Fail($"Cannot move status from {current} to {normalized}.");

        if (normalized == SystemConstants.DocumentStatuses.Released && string.IsNullOrWhiteSpace(entity.ReleaseStoredPath))
            return ApiResponse<DocumentRequestDto>.Fail("Upload a document before releasing this request.");

        if (normalized == SystemConstants.DocumentStatuses.OnHold)
        {
            if (string.IsNullOrWhiteSpace(holdReason) && string.IsNullOrWhiteSpace(entity.HoldReason))
                entity.HoldReason = "Awaiting resolution.";
            else if (!string.IsNullOrWhiteSpace(holdReason))
                entity.HoldReason = holdReason.Trim();
        }

        // Update this request only. Submission date and request id stay unchanged.
        entity.DocumentType = CanonicalDocumentType(entity.DocumentType);
        entity.RequestStatus = normalized;
        entity.ReleaseDate = normalized == SystemConstants.DocumentStatuses.Released ? DateTime.Now : null;

        await _db.SaveChangesAsync(cancellationToken);

        await _notifications.CreateAdminAsync("Document Request Updated", $"Request #{entity.RequestId}: {entity.DocumentType} is {normalized}.",
            cancellationToken: cancellationToken, requestId: entity.RequestId);

        var (title, message) = normalized switch
        {
            SystemConstants.DocumentStatuses.Processing => ("Document Status Updated",
                $"Your {entity.DocumentType} request is now being processed."),
            SystemConstants.DocumentStatuses.OnHold => ("Document Request On Hold",
                $"Your {entity.DocumentType} request is on hold{(string.IsNullOrWhiteSpace(entity.HoldReason) ? "." : $": {entity.HoldReason}")}"),
            SystemConstants.DocumentStatuses.ReadyForRelease => ("Document Ready for Release",
                $"Your {entity.DocumentType} is ready for release. Please follow the claim instructions from ABEC."),
            SystemConstants.DocumentStatuses.Released => ("Document Released",
                $"Your {entity.DocumentType} has been released and is ready for collection."),
            SystemConstants.DocumentStatuses.Rejected => ("Document Request Rejected",
                $"Your {entity.DocumentType} request was rejected."),
            _ => ("Document Status Updated", $"Your {entity.DocumentType} request is now: {normalized}.")
        };

        try
        {
            await _notifications.CreateAsync(title, message, studentId: entity.StudentId, cancellationToken: cancellationToken);
        }
        catch (Exception ex)
        {
            if (normalized == SystemConstants.DocumentStatuses.Released)
                return ApiResponse<DocumentRequestDto>.Ok(Map(entity),
                    "NOTIFY_FAILED: The request is Released, but the student dashboard notification could not be saved and no email was sent. " + ex.Message);
            return ApiResponse<DocumentRequestDto>.Ok(Map(entity), "Document request status updated, but the student notification could not be saved.");
        }

        if (normalized != SystemConstants.DocumentStatuses.Released)
            return ApiResponse<DocumentRequestDto>.Ok(Map(entity), "Document request status updated.");

        var studentName = entity.Student?.Applicant?.FullName ?? "Student";
        var email = entity.Student?.Applicant?.Email ?? string.Empty;
        var html = "<p>Hello " + System.Net.WebUtility.HtmlEncode(studentName) + ",</p>" +
            "<p>Your <strong>" + System.Net.WebUtility.HtmlEncode(entity.DocumentType) + "</strong> has been released and is ready for collection.</p>" +
            "<p>Please check your ABEC student dashboard for the release details.</p>";
        var sent = await _email.SendAsync(
            email,
            "ABEC document released: " + entity.DocumentType,
            html,
            cancellationToken: cancellationToken);
        if (!sent.Sent)
            return ApiResponse<DocumentRequestDto>.Ok(Map(entity),
                "EMAIL_NOT_SENT: The request is Released and the student dashboard notification was saved. The email was not sent. " + sent.Message);

        return ApiResponse<DocumentRequestDto>.Ok(Map(entity), "Document released. The student was notified on the dashboard and by email.");
    }

    public async Task<ApiResponse<DocumentRequestDto>> SaveReleaseFileAsync(int id, IFormFile file, CancellationToken cancellationToken = default)
    {
        if (file is null)
            return ApiResponse<DocumentRequestDto>.Fail("Choose a file to upload.");

        var entity = await _db.DocumentRequests
            .Include(r => r.Student)!.ThenInclude(s => s!.Applicant)!.ThenInclude(a => a!.Course)
            .FirstOrDefaultAsync(r => r.RequestId == id, cancellationToken);
        if (entity is null)
            return ApiResponse<DocumentRequestDto>.Fail("Document request not found.");

        await _db.RequireDocumentWriteAsync(entity.StudentId, cancellationToken);
        var current = NormalizeStatus(entity.RequestStatus) ?? entity.RequestStatus;
        if (current is not (SystemConstants.DocumentStatuses.Pending or SystemConstants.DocumentStatuses.Processing))
            return ApiResponse<DocumentRequestDto>.Fail("A file can be uploaded only while the request is Pending or Processing.");

        var validation = await ValidateReleaseFileAsync(file, cancellationToken);
        if (validation is not null)
            return ApiResponse<DocumentRequestDto>.Fail(validation);

        var dir = Path.Combine(ReleaseRoot, entity.RequestId.ToString());
        Directory.CreateDirectory(dir);
        // Previous objects are retained; replacement never destroys an existing released file.

        var safeOriginal = Path.GetFileName(file.FileName);
        var ext = Path.GetExtension(safeOriginal).ToLowerInvariant();
        var storedName = $"{Guid.NewGuid():N}{ext}";
        var fullPath = Path.Combine(dir, storedName);
        await using (var stream = new FileStream(fullPath, FileMode.Create))
            await file.CopyToAsync(stream, cancellationToken);

        entity.ReleaseFileName = safeOriginal;
        entity.ReleaseStoredPath = Path.Combine(entity.RequestId.ToString(), storedName).Replace('\\', '/');
        entity.ReleaseContentType = ext switch
        {
            ".pdf" => "application/pdf",
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            _ => "application/octet-stream"
        };
        entity.ReleaseSizeBytes = file.Length;
        entity.ReleaseUploadedAt = DateTime.Now;
        await _db.SaveChangesAsync(cancellationToken);
        await _notifications.CreateAdminAsync("Document File Uploaded", $"Release file uploaded for request #{entity.RequestId}.",
            cancellationToken: cancellationToken, requestId: entity.RequestId);
        return ApiResponse<DocumentRequestDto>.Ok(Map(entity), "Document file uploaded.");
    }

    public async Task<ApiResponse<DocumentRequestDto>> RemoveReleaseFileAsync(int id, CancellationToken cancellationToken = default)
    {
        var entity = await _db.DocumentRequests.FirstOrDefaultAsync(r => r.RequestId == id, cancellationToken);
        if (entity is null)
            return ApiResponse<DocumentRequestDto>.Fail("Document request not found.");

        await _db.RequireDocumentWriteAsync(entity.StudentId, cancellationToken);
        if (entity.RequestStatus == "Released") return ApiResponse<DocumentRequestDto>.Fail("Released files must be preserved.");
        var current = NormalizeStatus(entity.RequestStatus) ?? entity.RequestStatus;
        if (current is not (SystemConstants.DocumentStatuses.Pending or SystemConstants.DocumentStatuses.Processing))
            return ApiResponse<DocumentRequestDto>.Fail("A file can be removed only while the request is Pending or Processing.");

        if (!string.IsNullOrWhiteSpace(entity.ReleaseStoredPath))
        {
            var root = Path.GetFullPath(ReleaseRoot);
            var previous = Path.GetFullPath(Path.Combine(root, entity.ReleaseStoredPath.Replace('/', Path.DirectorySeparatorChar)));
            if (previous.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) && File.Exists(previous))
                File.Delete(previous);
        }

        entity.ReleaseFileName = null;
        entity.ReleaseStoredPath = null;
        entity.ReleaseContentType = null;
        entity.ReleaseSizeBytes = null;
        entity.ReleaseUploadedAt = null;
        await _db.SaveChangesAsync(cancellationToken);

        return ApiResponse<DocumentRequestDto>.Ok(Map(entity), "Document file removed.");
    }

    public async Task<(Stream? Stream, string? ContentType, string? FileName, string? Error)> OpenReleaseFileAsync(int id, CancellationToken cancellationToken = default)
    {
        var entity = await _db.DocumentRequests.AsNoTracking().FirstOrDefaultAsync(r => r.RequestId == id, cancellationToken);
        if (entity is null || string.IsNullOrWhiteSpace(entity.ReleaseStoredPath))
            return (null, null, null, "No file is stored for this request.");

        var (stream, contentType) = await UploadedDocument.OpenAsync(ReleaseRoot, entity.ReleaseStoredPath, cancellationToken);
        return stream is null ? (null, null, null, "The stored file is missing or has an unsupported type.")
            : (stream, contentType, Path.GetFileName(entity.ReleaseFileName), null);
    }

    public async Task<ApiResponse<object>> BulkUpdateStatusAsync(BulkStatusDto dto, CancellationToken cancellationToken = default)
    {
        var normalized = NormalizeStatus(dto.Status);
        if (normalized is null || normalized == SystemConstants.DocumentStatuses.NotRequested)
            return ApiResponse<object>.Fail("Invalid document request status.");

        var requests = await _db.DocumentRequests.Where(r => dto.Ids.Contains(r.RequestId)).ToListAsync(cancellationToken);
        if (normalized == SystemConstants.DocumentStatuses.Released && requests.Any(r => string.IsNullOrWhiteSpace(r.ReleaseStoredPath)))
            return ApiResponse<object>.Fail("Every released request must have its own uploaded file.");
        var changed = new List<DocumentRequest>();
        foreach (var request in requests)
        {
            await _db.RequireDocumentWriteAsync(request.StudentId, cancellationToken);
            var current = NormalizeStatus(request.RequestStatus) ?? request.RequestStatus;
            if (!IsTransitionAllowed(current, normalized))
                continue;

            if (string.Equals(current, normalized, StringComparison.OrdinalIgnoreCase))
                continue;
            request.DocumentType = CanonicalDocumentType(request.DocumentType);
            request.RequestStatus = normalized;
            request.ReleaseDate = normalized == SystemConstants.DocumentStatuses.Released ? DateTime.Now : null;
            changed.Add(request);
        }

        await _db.SaveChangesAsync(cancellationToken);
        foreach (var request in changed)
        {
            await _notifications.CreateAdminAsync("Document Request Updated", $"Request #{request.RequestId}: {request.DocumentType} is {normalized}.",
                cancellationToken: cancellationToken, requestId: request.RequestId);
            await _notifications.CreateAsync("Document Status Updated", $"Your {request.DocumentType} request is now: {normalized}.", studentId: request.StudentId, cancellationToken: cancellationToken);
        }
        return ApiResponse<object>.Ok(new { updated = changed.Count }, "Bulk document status update completed.");
    }

    private IQueryable<DocumentRequest> BaseQuery()
        => _db.DocumentRequests.AsNoTracking()
            .Include(r => r.Student)!.ThenInclude(s => s!.Applicant)!.ThenInclude(a => a!.Course);

    private static bool IsTransitionAllowed(string current, string next)
    {
        if (string.Equals(current, next, StringComparison.OrdinalIgnoreCase))
            return false;

        return (current, next) switch
        {
            (SystemConstants.DocumentStatuses.Pending, SystemConstants.DocumentStatuses.Processing) => true,
            (SystemConstants.DocumentStatuses.Pending, SystemConstants.DocumentStatuses.OnHold) => true,
            (SystemConstants.DocumentStatuses.Processing, SystemConstants.DocumentStatuses.OnHold) => true,
            (SystemConstants.DocumentStatuses.Processing, SystemConstants.DocumentStatuses.Released) => true,
            (SystemConstants.DocumentStatuses.OnHold, SystemConstants.DocumentStatuses.Processing) => true,
            (SystemConstants.DocumentStatuses.OnHold, SystemConstants.DocumentStatuses.Rejected) => true,
            (SystemConstants.DocumentStatuses.ReadyForRelease, SystemConstants.DocumentStatuses.OnHold) => true,
            (SystemConstants.DocumentStatuses.ReadyForRelease, SystemConstants.DocumentStatuses.Released) => true,
            _ => false
        };
    }

    private static async Task<string?> ValidateReleaseFileAsync(IFormFile file, CancellationToken cancellationToken)
    {
        if (file.Length <= 0)
            return "The uploaded file is empty.";
        if (file.Length > SystemConstants.RegistrationUploadLimits.MaxFileBytes)
            return $"Each file must be {SystemConstants.RegistrationUploadLimits.MaxFileBytes / (1024 * 1024)} MB or smaller.";
        var ext = Path.GetExtension(Path.GetFileName(file.FileName)).ToLowerInvariant();
        if (!SystemConstants.RegistrationUploadLimits.AllowedExtensions.Contains(ext))
            return "Allowed file types: PDF, JPG, JPEG, PNG.";
        await using var stream = file.OpenReadStream();
        var valid = await UploadedDocument.HasSignatureAsync(stream, UploadedDocument.ContentType("file" + ext), cancellationToken);
        return valid ? null : "The uploaded file does not match its file type.";
    }

    private static bool IsAbecProvidedDocument(string? value)
    {
        var canonical = CanonicalDocumentType(value);
        return SystemConstants.DocumentStatuses.PostCourseCredentials
            .Any(d => string.Equals(d, canonical, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>
    /// Maps aliases and legacy names onto the ABEC-provided course documents.
    /// Applicant-submitted docs (TOR, Honorable Dismissal, etc.) stay non-requestable.
    /// </summary>
    private static string CanonicalDocumentType(string? value)
    {
        var text = (value ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(text)) return string.Empty;

        var lower = text.ToLowerInvariant();

        if (SystemConstants.DocumentStatuses.IsTrainingCertificateAlias(text)
            || lower.Contains("completion") || lower is "coa")
            return SystemConstants.DocumentStatuses.CertificateOfCompletion;

        if (lower.Contains("payment") || lower.Contains("receipt"))
            return "Payment Receipt";

        if (lower.Contains("national certificate")
            || lower.Contains("tesda")
            || lower is "nc2" or "nc ii" or "nc i" or "ncii" or "nci"
            || (lower.Contains("national") && lower.Contains("certificate")))
            return "National Certificate (TESDA)";

        // Exact match for already-canonical ABEC names
        foreach (var name in SystemConstants.DocumentStatuses.PostCourseCredentials)
        {
            if (string.Equals(name, text, StringComparison.OrdinalIgnoreCase))
                return name;
        }

        return text;
    }

    private static string? NormalizeStatus(string? status)
    {
        if (string.IsNullOrWhiteSpace(status)) return null;
        var trimmed = status.Trim();
        return trimmed.ToLowerInvariant() switch
        {
            "not requested" or "notrequested" => SystemConstants.DocumentStatuses.NotRequested,
            "pending" => SystemConstants.DocumentStatuses.Pending,
            "processing" or "approved" => SystemConstants.DocumentStatuses.Processing,
            "on hold" or "onhold" or "hold" => SystemConstants.DocumentStatuses.OnHold,
            "rejected" or "reject" => SystemConstants.DocumentStatuses.Rejected,
            "ready for release" or "readyforrelease" or "ready" => SystemConstants.DocumentStatuses.ReadyForRelease,
            "released" or "archived" => SystemConstants.DocumentStatuses.Released,
            _ when SystemConstants.DocumentStatuses.AdminWorkflow.Contains(trimmed, StringComparer.OrdinalIgnoreCase)
                || string.Equals(trimmed, SystemConstants.DocumentStatuses.NotRequested, StringComparison.OrdinalIgnoreCase)
                => SystemConstants.DocumentStatuses.AdminWorkflow
                    .FirstOrDefault(s => string.Equals(s, trimmed, StringComparison.OrdinalIgnoreCase))
                   ?? (string.Equals(trimmed, SystemConstants.DocumentStatuses.NotRequested, StringComparison.OrdinalIgnoreCase)
                        ? SystemConstants.DocumentStatuses.NotRequested
                        : null),
            _ => null
        };
    }

    private static DocumentRequestDto Map(DocumentRequest r) => new()
    {
        RequestId = r.RequestId,
        StudentId = r.StudentId,
        StudentName = r.Student?.Applicant?.FullName ?? string.Empty,
        Email = r.Student?.Applicant?.Email ?? string.Empty,
        ContactNumber = r.Student?.Applicant?.ContactNumber ?? string.Empty,
        CourseName = r.Student?.Applicant?.Course?.CourseName ?? string.Empty,
        DocumentType = CanonicalDocumentType(r.DocumentType),
        Reason = r.Reason,
        SpecificReason = r.SpecificReason,
        RequestStatus = NormalizeStatus(r.RequestStatus) ?? r.RequestStatus,
        HoldReason = r.HoldReason,
        RequestDate = r.RequestDate,
        ReleaseDate = r.ReleaseDate,
        HasFile = !string.IsNullOrWhiteSpace(r.ReleaseStoredPath),
        ReleaseFileName = r.ReleaseFileName,
        ReleaseFileSize = r.ReleaseSizeBytes,
        ReleaseUploadedAt = r.ReleaseUploadedAt
    };
}
