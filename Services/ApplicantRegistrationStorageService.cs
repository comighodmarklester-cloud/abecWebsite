using ABEC_System.Constants;
using ABEC_System.Data;
using ABEC_System.DTOs;
using ABEC_System.Models;
using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Services;

public class ApplicantRegistrationStorageService
{
    private readonly ApplicationDbContext _db;
    private readonly IWebHostEnvironment _env;

    public ApplicantRegistrationStorageService(ApplicationDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _env = env;
    }

    private string SecureRoot =>
        Path.Combine(_env.ContentRootPath, "App_Data", "secure-uploads", "applicants");

    public async Task<ApiResponse<object>> SaveEnrollmentDocumentsAsync(
        int applicantId,
        IReadOnlyList<IFormFile> credentialFiles,
        IFormFile? identityFile,
        IReadOnlyList<string>? credentialLabels = null,
        CancellationToken cancellationToken = default)
    {
        await _db.RequireActiveBatchAsync(await _db.Applicants.AsNoTracking()
            .Where(a => a.ApplicantId == applicantId).Select(a => a.BatchId).SingleOrDefaultAsync(cancellationToken), cancellationToken);
        var applicantDir = Path.Combine(SecureRoot, applicantId.ToString());
        Directory.CreateDirectory(applicantDir);

        var saved = new List<ApplicantRegistrationDocument>();
        var pending = new List<(IFormFile File, string Label)>();
        var usedLabels = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        for (var i = 0; i < credentialFiles.Count; i++)
        {
            var file = credentialFiles[i];
            if (file is null || file.Length == 0)
                continue;

            var validation = await ValidateCredentialPdfAsync(file, cancellationToken);
            if (validation is not null)
                return ApiResponse<object>.Fail(validation);

            var requested = credentialLabels is not null && i < credentialLabels.Count ? credentialLabels[i] : null;
            var label = CanonicalCredentialLabel(requested) ?? InferCredentialLabel(file.FileName);
            if (label is null || !SystemConstants.RegistrationChoices.CredentialDocumentTypes.Contains(label, StringComparer.OrdinalIgnoreCase))
                return ApiResponse<object>.Fail("Each required document must be identified as Form 138, TOR, Honorable Dismissal, or Certificate of Good Moral Character.");
            if (!usedLabels.Add(label))
                return ApiResponse<object>.Fail("Each required document type can be uploaded only once.");
            pending.Add((file, label));
        }

        foreach (var required in SystemConstants.RegistrationChoices.CredentialDocumentTypes)
        {
            if (!usedLabels.Contains(required))
                return ApiResponse<object>.Fail("Please upload all required documents: Form 138, TOR, Honorable Dismissal, and Certificate of Good Moral Character.");
        }

        if (identityFile is null || identityFile.Length == 0)
            return ApiResponse<object>.Fail("Please upload one valid ID.");

        var idValidation = await ValidateIdentityFileAsync(identityFile, cancellationToken);
        if (idValidation is not null)
            return ApiResponse<object>.Fail(idValidation);

        foreach (var item in pending)
            saved.Add(await SaveFileAsync(applicantId, applicantDir, item.File, SystemConstants.ApplicantDocumentCategories.Credential, item.Label, cancellationToken));
        saved.Add(await SaveFileAsync(applicantId, applicantDir, identityFile, SystemConstants.ApplicantDocumentCategories.Identity, "IdentityID", cancellationToken));

        if (saved.Count == 0)
            return ApiResponse<object>.Ok(new { count = 0 }, "No registration documents were uploaded.");

        _db.ApplicantRegistrationDocuments.AddRange(saved);
        await _db.SaveChangesAsync(cancellationToken);
        return ApiResponse<object>.Ok(new { count = saved.Count }, "Registration documents stored.");
    }

    public async Task<ApiResponse<IReadOnlyList<ApplicantRegistrationDocumentDto>>> ListForApplicantAsync(
        int applicantId,
        CancellationToken cancellationToken = default)
    {
        var docs = await _db.ApplicantRegistrationDocuments.AsNoTracking()
            .Where(d => d.ApplicantId == applicantId)
            .OrderBy(d => d.Category)
            .ThenBy(d => d.DocumentLabel)
            .ToListAsync(cancellationToken);

        return ApiResponse<IReadOnlyList<ApplicantRegistrationDocumentDto>>.Ok(docs.Select(Map).ToList());
    }

    public async Task<ApiResponse<IReadOnlyList<ApplicantRegistrationDocumentDto>>> ListAllAsync(CancellationToken cancellationToken = default, int? batchId = null)
    {
        var selectedBatchId = await _db.ResolveReadBatchIdAsync(batchId, cancellationToken);
        var docs = await _db.ApplicantRegistrationDocuments.AsNoTracking()
            .Where(d => _db.Applicants.Any(a => a.ApplicantId == d.ApplicantId && a.BatchId == selectedBatchId))
            .OrderBy(d => d.ApplicantId)
            .ThenBy(d => d.DocumentLabel)
            .ToListAsync(cancellationToken);
        return ApiResponse<IReadOnlyList<ApplicantRegistrationDocumentDto>>.Ok(docs.Select(Map).ToList());
    }

    public async Task<(Stream? Stream, string? ContentType, string? FileName, string? Error)> OpenDocumentAsync(
        int applicantId,
        int documentId,
        CancellationToken cancellationToken = default)
    {
        var doc = await _db.ApplicantRegistrationDocuments.AsNoTracking()
            .FirstOrDefaultAsync(d => d.DocumentId == documentId && d.ApplicantId == applicantId, cancellationToken);
        if (doc is null)
            return (null, null, null, "Document not found.");

        var (stream, contentType) = await UploadedDocument.OpenAsync(SecureRoot, doc.StoredRelativePath, cancellationToken);
        return stream is null ? (null, null, null, "The stored file is missing or has an unsupported type.")
            : (stream, contentType, Path.GetFileName(doc.OriginalFileName), null);
    }

    private async Task<ApplicantRegistrationDocument> SaveFileAsync(
        int applicantId,
        string applicantDir,
        IFormFile file,
        string category,
        string? label,
        CancellationToken cancellationToken)
    {
        var safeOriginal = DisplayFileName(category, label, file.FileName);
        var ext = Path.GetExtension(safeOriginal).ToLowerInvariant();
        if (string.IsNullOrEmpty(ext))
            ext = Path.GetExtension(Path.GetFileName(file.FileName)).ToLowerInvariant();
        var storedName = $"{Guid.NewGuid():N}{ext}";
        var fullPath = Path.Combine(applicantDir, storedName);

        await using (var stream = new FileStream(fullPath, FileMode.Create))
            await file.CopyToAsync(stream, cancellationToken);

        var relative = Path.Combine(applicantId.ToString(), storedName).Replace('\\', '/');

        return new ApplicantRegistrationDocument
        {
            ApplicantId = applicantId,
            Category = category,
            DocumentLabel = label,
            OriginalFileName = safeOriginal,
            StoredRelativePath = relative,
            ContentType = UploadedDocument.ContentType(storedName)!,
            SizeBytes = file.Length,
            UploadedAt = DateTime.Now
        };
    }

    private static async Task<string?> ValidateCredentialPdfAsync(IFormFile file, CancellationToken cancellationToken)
    {
        var sizeError = ValidateSize(file);
        if (sizeError is not null) return sizeError;
        var ext = Path.GetExtension(Path.GetFileName(file.FileName)).ToLowerInvariant();
        if (ext != ".pdf")
            return "Required documents must be PDF files.";
        if (!await HasPdfHeaderAsync(file, cancellationToken))
            return "The uploaded file is not a valid PDF.";
        return null;
    }

    private static async Task<string?> ValidateIdentityFileAsync(IFormFile file, CancellationToken cancellationToken)
    {
        var sizeError = ValidateSize(file);
        if (sizeError is not null) return sizeError;
        var ext = Path.GetExtension(Path.GetFileName(file.FileName)).ToLowerInvariant();
        if (!SystemConstants.RegistrationUploadLimits.AllowedExtensions.Contains(ext))
            return "Allowed ID file types: PDF, JPG, JPEG, PNG.";
        var ok = ext == ".pdf"
            ? await HasPdfHeaderAsync(file, cancellationToken)
            : await HasImageHeaderAsync(file, ext, cancellationToken);
        return ok ? null : "The uploaded ID file does not match its file type.";
    }

    private static string? ValidateSize(IFormFile file)
    {
        if (file.Length <= 0)
            return "One of the uploaded files is empty.";
        if (file.Length > SystemConstants.RegistrationUploadLimits.MaxRegistrationFileBytes)
            return $"Each file must be {SystemConstants.RegistrationUploadLimits.MaxRegistrationFileBytes / (1024 * 1024)} MB or smaller.";
        return null;
    }

    private static async Task<bool> HasPdfHeaderAsync(IFormFile file, CancellationToken cancellationToken)
    {
        await using var stream = file.OpenReadStream();
        return await UploadedDocument.HasSignatureAsync(stream, "application/pdf", cancellationToken);
    }

    private static async Task<bool> HasImageHeaderAsync(IFormFile file, string ext, CancellationToken cancellationToken)
    {
        await using var stream = file.OpenReadStream();
        return await UploadedDocument.HasSignatureAsync(stream, UploadedDocument.ContentType("file" + ext), cancellationToken);
    }

    private static string? CanonicalCredentialLabel(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var compact = new string(value.Where(char.IsLetterOrDigit).ToArray()).ToLowerInvariant();
        if (compact is "form138") return "Form138";
        if (compact is "tor" or "transcriptofrecords") return "TOR";
        if (compact.Contains("honorable") || compact is "honoredismissal") return "HonorableDismissal";
        if (compact is "goodmoral" || compact.Contains("goodmoral")) return "GoodMoral";
        return SystemConstants.RegistrationChoices.CredentialDocumentTypes
            .FirstOrDefault(t => t.Equals(value.Trim(), StringComparison.OrdinalIgnoreCase));
    }

    private static string DisplayFileName(string category, string? label, string originalName)
    {
        if (string.Equals(category, SystemConstants.ApplicantDocumentCategories.Credential, StringComparison.Ordinal))
        {
            return CanonicalCredentialLabel(label) switch
            {
                "TOR" => "TOR.pdf",
                "Form138" => "Form138.pdf",
                "HonorableDismissal" => "HonorableDismissal.pdf",
                "GoodMoral" => "GoodMoral.pdf",
                _ => Path.GetFileName(originalName)
            };
        }

        return Path.GetFileName(originalName);
    }

    private static string? InferCredentialLabel(string fileName)
    {
        var stem = Path.GetFileNameWithoutExtension(fileName).Trim();
        var exact = stem.ToLowerInvariant() switch
        {
            "tor" => "TOR",
            "form138" => "Form138",
            "honoredismissal" => "HonorableDismissal",
            "goodmoral" => "GoodMoral",
            _ => (string?)null
        };
        if (exact is not null)
            return exact;

        var baseName = Path.GetFileNameWithoutExtension(fileName);
        var parts = baseName.Split(',');
        if (parts.Length < 3) return null;
        var docPart = parts[2].Trim().ToLowerInvariant().Replace(" ", "");
        if (docPart.Contains("form138") || docPart == "form138") return "Form138";
        if (docPart.Contains("tor") || docPart.Contains("transcript")) return "TOR";
        if (docPart.Contains("honorable") || docPart.Contains("dismissal")) return "HonorableDismissal";
        if (docPart.Contains("goodmoral") || docPart.Contains("goodmoralcharacter") || docPart.Contains("good_moral"))
            return "GoodMoral";
        return null;
    }

    private static ApplicantRegistrationDocumentDto Map(ApplicantRegistrationDocument d) => new()
    {
        DocumentId = d.DocumentId,
        ApplicantId = d.ApplicantId,
        Category = d.Category,
        DocumentLabel = d.DocumentLabel,
        OriginalFileName = d.OriginalFileName,
        ContentType = UploadedDocument.ContentType(d.StoredRelativePath) ?? "application/octet-stream",
        SizeBytes = d.SizeBytes,
        UploadedAt = d.UploadedAt
    };
}
