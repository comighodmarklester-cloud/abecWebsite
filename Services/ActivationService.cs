using ABEC_System.Constants;
using ABEC_System.Data;
using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using ABEC_System.Options;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using System.Net;

namespace ABEC_System.Services;

public class ActivationService : IActivationService
{
    private readonly ApplicationDbContext _db;
    private readonly INotificationService _notifications;
    private readonly IPdfService _pdf;
    private readonly IArchiveService _archives;
    private readonly IEmailService _email;
    private readonly IOptionsMonitor<AppSettings> _app;
    private readonly IWebHostEnvironment _environment;

    public ActivationService(
        ApplicationDbContext db,
        INotificationService notifications,
        IPdfService pdf,
        IArchiveService archives,
        IEmailService email,
        IOptionsMonitor<AppSettings> app,
        IWebHostEnvironment environment)
    {
        _db = db;
        _notifications = notifications;
        _pdf = pdf;
        _archives = archives;
        _email = email;
        _app = app;
        _environment = environment;
    }

    public async Task<ApiResponse<ActivationSummaryDto>> GetSummaryAsync(CancellationToken cancellationToken = default, int? batchId = null)
    {
        batchId = await _db.ResolveReadBatchIdAsync(batchId, cancellationToken);
        var students = await _db.Students.AsNoTracking()
            .Where(s => s.BatchId == batchId)
            .Select(s => new { s.StudentId, s.AccountStatus })
            .ToListAsync(cancellationToken);
        var archivedIds = await _db.Archives.AsNoTracking()
            .Select(a => a.StudentId)
            .Distinct()
            .ToListAsync(cancellationToken);
        var archivedSet = archivedIds.ToHashSet();

        var summary = new ActivationSummaryDto
        {
            TotalApprovedStudents = students.Count,
            PendingActivation = students.Count(s =>
                s.AccountStatus == SystemConstants.AccountStatuses.Inactive && !archivedSet.Contains(s.StudentId)),
            ActivatedAccounts = students.Count(s => s.AccountStatus == SystemConstants.AccountStatuses.Active),
            DeactivatedAccounts = students.Count(s =>
                s.AccountStatus == SystemConstants.AccountStatuses.Inactive && archivedSet.Contains(s.StudentId))
        };
        return ApiResponse<ActivationSummaryDto>.Ok(summary);
    }

    public async Task<ApiResponse<IReadOnlyList<StudentDto>>> GetAccountsAsync(
        string? status = null, int? courseId = null, string? search = null, CancellationToken cancellationToken = default, int? batchId = null)
    {
        var archivedIds = await _db.Archives.AsNoTracking()
            .Select(a => a.StudentId)
            .Distinct()
            .ToListAsync(cancellationToken);
        var archivedSet = archivedIds.ToHashSet();

        var query = _db.Students.AsNoTracking()
            .Include(s => s.Applicant)!.ThenInclude(a => a!.Course)
            .Include(s => s.Batch)
            .AsQueryable();

        var selectedBatchId = await _db.ResolveReadBatchIdAsync(batchId, cancellationToken);
        query = query.Where(s => s.BatchId == selectedBatchId);
        if (!string.IsNullOrWhiteSpace(status) && !string.Equals(status, "all", StringComparison.OrdinalIgnoreCase))
        {
            if (string.Equals(status, "pending", StringComparison.OrdinalIgnoreCase))
            {
                // Never-activated / awaiting activation only — exclude archived students.
                query = query.Where(s =>
                    s.AccountStatus == SystemConstants.AccountStatuses.Inactive
                    && !archivedIds.Contains(s.StudentId));
            }
            else if (string.Equals(status, "activated", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(s => s.AccountStatus == SystemConstants.AccountStatuses.Active);
            }
            else if (string.Equals(status, "deactivated", StringComparison.OrdinalIgnoreCase))
            {
                query = query.Where(s =>
                    s.AccountStatus == SystemConstants.AccountStatuses.Inactive
                    && archivedIds.Contains(s.StudentId));
            }
            else
            {
                query = query.Where(s => s.AccountStatus == status);
            }
        }

        if (courseId.HasValue)
            query = query.Where(s => s.Applicant != null && s.Applicant.CourseId == courseId.Value);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(s =>
                s.Applicant!.FirstName.ToLower().Contains(term) ||
                s.Applicant.LastName.ToLower().Contains(term) ||
                s.Applicant.Email.ToLower().Contains(term));
        }

        var list = await query.OrderByDescending(s => s.CreatedAt).ToListAsync(cancellationToken);
        return ApiResponse<IReadOnlyList<StudentDto>>.Ok(list.Select(s => Map(s, archivedSet)).ToList());
    }

    public async Task<ApiResponse<StudentDto>> GeneratePinAsync(int studentId, CancellationToken cancellationToken = default)
    {
        await using var workflowLock = await SlotWorkflowLock.AcquireAsync(_db, "student:" + studentId, cancellationToken);
        var student = await LoadStudentAsync(studentId, cancellationToken);
        if (student is null)
            return ApiResponse<StudentDto>.Fail("Student account not found.");

        if (await IsArchivedAsync(studentId, cancellationToken))
            return ApiResponse<StudentDto>.Fail("This student is archived. Reactivate the account before generating a PIN.");

        student.SecurityPin = await GenerateUniquePinAsync(studentId, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);

        await _notifications.CreateAsync(
            "Security PIN Generated",
            "Your security PIN has been generated. Please collect your Activation Notice from the registrar.",
            studentId: student.StudentId,
            cancellationToken: cancellationToken);

        return ApiResponse<StudentDto>.Ok(await MapAsync(student, cancellationToken), "Security PIN generated.");
    }

    public async Task<ApiResponse<StudentDto>> ActivateAsync(int studentId, CancellationToken cancellationToken = default)
    {
        await using var workflowLock = await SlotWorkflowLock.AcquireAsync(_db, "student:" + studentId, cancellationToken);
        var student = await LoadStudentAsync(studentId, cancellationToken);
        if (student is null)
            return ApiResponse<StudentDto>.Fail("Student account not found.");

        await _db.Entry(student).ReloadAsync(cancellationToken);
        await using var transaction = await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
        await _db.RequireActiveBatchAsync(student.BatchId, cancellationToken);
        // Reactivate removes the archive record so the student leaves Archive and is Active again.
        var archives = await _db.Archives.Where(a => a.StudentId == studentId).ToListAsync(cancellationToken);
        if (student.AccountStatus == SystemConstants.AccountStatuses.Active && archives.Count == 0)
            return ApiResponse<StudentDto>.Ok(await MapAsync(student, cancellationToken), "Account is already active.");
        var wasPending = student.AccountStatus == SystemConstants.AccountStatuses.Inactive && archives.Count == 0;
        if (archives.Count > 0)
            _db.Archives.RemoveRange(archives);

        await EnsurePinAsync(student, cancellationToken);
        if (string.IsNullOrWhiteSpace(student.SecurityPin))
            student.SecurityPin = await GenerateUniquePinAsync(studentId, cancellationToken);

        student.AccountStatus = SystemConstants.AccountStatuses.Active;
        await _db.SaveChangesAsync(cancellationToken);

        await _notifications.CreateAsync(
            "Account Activated",
            "Your ABEC student account has been activated. Sign in using your Security PIN.",
            studentId: student.StudentId,
            cancellationToken: cancellationToken);

        await transaction.CommitAsync(cancellationToken);
        await transaction.DisposeAsync();
        var account = await MapAsync(student, CancellationToken.None);
        if (!wasPending) return ApiResponse<StudentDto>.Ok(account, "Account activated.");

        // SMTP runs only after the activation and its notification commit. Snapshot this
        // student's saved PIN; the student lock also blocks concurrent PIN regeneration.
        var sent = await SendActivationEmailAsync(account);
        return ApiResponse<StudentDto>.Ok(account, sent.Sent
            ? "Account activated. The student was notified by email."
            : "EMAIL_NOT_SENT: Account activated, but the activation email could not be delivered. " + sent.Message);
    }

    public async Task<ApiResponse<StudentDto>> DeactivateAsync(
        int studentId,
        string archiveReason,
        string? specificReason = null,
        CancellationToken cancellationToken = default)
    {
        var student = await LoadStudentAsync(studentId, cancellationToken);
        if (student is null)
            return ApiResponse<StudentDto>.Fail("Student account not found.");

        var archiveResult = await _archives.CreateAsync(new CreateArchiveDto
        {
            StudentId = studentId,
            ArchiveReason = archiveReason,
            SpecificReason = specificReason
        }, cancellationToken);

        if (!archiveResult.Success)
            return ApiResponse<StudentDto>.Fail(archiveResult.Message);

        // Reload after archive service updated the same student row.
        student = await LoadStudentAsync(studentId, cancellationToken);
        return ApiResponse<StudentDto>.Ok(
            await MapAsync(student!, cancellationToken),
            "Account deactivated and moved to Archive.");
    }

    public async Task<ApiResponse<StudentDto>> ReactivateAsync(int studentId, CancellationToken cancellationToken = default)
        => await ActivateAsync(studentId, cancellationToken);

    public async Task<ApiResponse<object>> BulkUpdateStatusAsync(BulkStatusDto dto, CancellationToken cancellationToken = default)
    {
        var status = NormalizeStatus(dto.Status);
        if (status is null) return ApiResponse<object>.Fail("Invalid account status.");
        if (status != SystemConstants.AccountStatuses.Active)
            return ApiResponse<object>.Fail("To deactivate accounts, use Deactivate with an archive reason so the student is moved to Archive.");

        var ids = await _db.Students.AsNoTracking().Where(s => dto.Ids.Contains(s.StudentId))
            .Select(s => s.StudentId).ToListAsync(cancellationToken);
        var updated = 0;
        var warnings = new List<string>();
        foreach (var id in ids)
        {
            var result = await ActivateAsync(id, cancellationToken);
            if (result.Success) updated++;
            if (!result.Success || result.Message.StartsWith("EMAIL_NOT_SENT:", StringComparison.Ordinal))
                warnings.Add($"Student #{id}: {result.Message}");
        }
        var message = warnings.Count == 0 ? "Bulk activation update completed."
            : "EMAIL_NOT_SENT: Bulk activation completed with issues. " + string.Join(" ", warnings);
        return ApiResponse<object>.Ok(new { updated }, message);
    }

    private async Task<EmailSendResult> SendActivationEmailAsync(StudentDto student)
    {
        try
        {
            var baseUrl = (_app.CurrentValue.PublicBaseUrl ?? string.Empty).Trim().TrimEnd('/');
            if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https")
                || !string.IsNullOrEmpty(uri.UserInfo) || !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment)
                || (!_environment.IsDevelopment() && (uri.Scheme != "https" || uri.IsLoopback)))
                return EmailSendResult.Fail("Configure App__PublicBaseUrl with the public ABEC app URL (HTTPS in production).");
            var portal = WebUtility.HtmlEncode(baseUrl + "/Views/Home/LoginPage.html");
            var name = WebUtility.HtmlEncode(student.FullName);
            var pin = WebUtility.HtmlEncode(student.SecurityPin);
            var body = $"""
                <html><body style="font-family:Segoe UI,Arial,sans-serif;color:#0b2747">
                <p>Hello {name},</p>
                <p>Your ABEC student account is now <strong>Active</strong> and ready to use.</p>
                <p>Open the <a href="{portal}">Student Portal</a> and sign in using your registered email address and security PIN.</p>
                <p>Your security PIN: <strong>{pin}</strong></p>
                <p>Keep your PIN private. Please contact ABEC if you need help accessing your account.</p>
                <p>ABEC</p>
                </body></html>
                """;
            return await _email.SendAsync(student.Email, "Your ABEC Student Account Is Now Active", body, cancellationToken: CancellationToken.None);
        }
        catch
        {
            // Activation is already committed. Never expose a PIN or credentials in error text.
            return EmailSendResult.Fail("The email service could not send the activation message.");
        }
    }

    public async Task<ApiResponse<byte[]>> GetActivationNoticePdfAsync(int studentId, CancellationToken cancellationToken = default)
    {
        var student = await LoadStudentAsync(studentId, cancellationToken);
        if (student is null)
            return ApiResponse<byte[]>.Fail("Student account not found.");

        if (string.IsNullOrWhiteSpace(student.SecurityPin))
            return ApiResponse<byte[]>.Fail("Security PIN has not been generated yet.");

        return ApiResponse<byte[]>.Ok(_pdf.GenerateActivationNoticePdf(student), "Activation notice ready.");
    }

    private async Task<bool> IsArchivedAsync(int studentId, CancellationToken cancellationToken)
        => await _db.Archives.AnyAsync(a => a.StudentId == studentId, cancellationToken);

    private async Task<Models.Student?> LoadStudentAsync(int studentId, CancellationToken cancellationToken)
        => await _db.Students
            .Include(s => s.Applicant)!.ThenInclude(a => a!.Course)
            .Include(s => s.Batch)
            .FirstOrDefaultAsync(s => s.StudentId == studentId, cancellationToken);

    private async Task<string> GenerateUniquePinAsync(int studentId, CancellationToken cancellationToken)
    {
        string pin;
        do
        {
            pin = SecurityPinGenerator.Generate();
        } while (await _db.Students.AnyAsync(s => s.SecurityPin == pin && s.StudentId != studentId, cancellationToken));
        return pin;
    }

    private async Task EnsurePinAsync(Models.Student student, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(student.SecurityPin))
            student.SecurityPin = await GenerateUniquePinAsync(student.StudentId, ct);
    }

    private static string? NormalizeStatus(string status) => status.ToLowerInvariant() switch
    {
        "active" or "activated" => SystemConstants.AccountStatuses.Active,
        "inactive" or "deactivated" or "pending" => SystemConstants.AccountStatuses.Inactive,
        _ => null
    };

    private async Task<StudentDto> MapAsync(Models.Student s, CancellationToken cancellationToken)
    {
        var archived = await IsArchivedAsync(s.StudentId, cancellationToken);
        return Map(s, archived ? new HashSet<int> { s.StudentId } : new HashSet<int>());
    }

    private static StudentDto Map(Models.Student s, HashSet<int> archivedIds) => new()
    {
        StudentId = s.StudentId,
        ApplicantId = s.ApplicantId,
        FullName = s.Applicant?.FullName ?? string.Empty,
        Email = s.Applicant?.Email ?? string.Empty,
        ContactNumber = s.Applicant?.ContactNumber ?? string.Empty,
        Address = AddressFormatting.FullAddress(s.Applicant),
        CourseName = s.Applicant?.Course?.CourseName ?? string.Empty,
        CourseId = s.Applicant?.CourseId ?? 0,
        BatchId = s.BatchId,
        BatchName = s.Batch?.BatchName ?? string.Empty,
        SecurityPin = s.SecurityPin,
        AccountStatus = s.AccountStatus,
        ApplicationStatus = s.Applicant?.ApplicationStatus ?? string.Empty,
        ConfirmationStatus = SystemConstants.ApplicationStatuses.IsConfirmedSlot(s.Applicant?.ApplicationStatus)
            || s.Applicant?.ConfirmedAt != null
            ? SystemConstants.ApplicationStatuses.Confirmed
            : (s.Applicant?.ApplicationStatus ?? "—"),
        ApplicationDate = s.Applicant?.ApplicationDate,
        ConfirmedAt = s.Applicant?.ConfirmedAt,
        CreatedAt = s.CreatedAt,
        IsArchived = archivedIds.Contains(s.StudentId)
    };
}
