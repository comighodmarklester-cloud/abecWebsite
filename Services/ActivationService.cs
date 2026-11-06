using ABEC_System.Constants;
using ABEC_System.Data;
using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Services;

public class ActivationService : IActivationService
{
    private readonly ApplicationDbContext _db;
    private readonly INotificationService _notifications;
    private readonly IPdfService _pdf;
    private readonly IArchiveService _archives;

    public ActivationService(
        ApplicationDbContext db,
        INotificationService notifications,
        IPdfService pdf,
        IArchiveService archives)
    {
        _db = db;
        _notifications = notifications;
        _pdf = pdf;
        _archives = archives;
    }

    public async Task<ApiResponse<ActivationSummaryDto>> GetSummaryAsync(CancellationToken cancellationToken = default)
    {
        var students = await _db.Students.AsNoTracking()
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

        if (batchId.HasValue) query = query.Where(s => s.BatchId == batchId);
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
        var student = await LoadStudentAsync(studentId, cancellationToken);
        if (student is null)
            return ApiResponse<StudentDto>.Fail("Student account not found.");

        // Reactivate removes the archive record so the student leaves Archive and is Active again.
        var archives = await _db.Archives.Where(a => a.StudentId == studentId).ToListAsync(cancellationToken);
        if (archives.Count > 0)
            _db.Archives.RemoveRange(archives);

        if (SecurityPinGenerator.TryGenerate(student, out var standardizedPin))
            student.SecurityPin = standardizedPin;

        student.AccountStatus = SystemConstants.AccountStatuses.Active;
        await _db.SaveChangesAsync(cancellationToken);

        await _notifications.CreateAsync(
            "Account Activated",
            "Your ABEC student account has been activated. Sign in using your Security PIN.",
            studentId: student.StudentId,
            cancellationToken: cancellationToken);

        return ApiResponse<StudentDto>.Ok(await MapAsync(student, cancellationToken), "Account activated.");
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
        if (status is null)
            return ApiResponse<object>.Fail("Invalid account status.");

        var students = await _db.Students.Where(s => dto.Ids.Contains(s.StudentId)).ToListAsync(cancellationToken);
        var updated = 0;

        foreach (var student in students)
        {
            if (status == SystemConstants.AccountStatuses.Active)
            {
                var archives = await _db.Archives.Where(a => a.StudentId == student.StudentId).ToListAsync(cancellationToken);
                if (archives.Count > 0)
                    _db.Archives.RemoveRange(archives);

                if (SecurityPinGenerator.TryGenerate(student, out var standardizedPin))
                    student.SecurityPin = standardizedPin;
                student.AccountStatus = SystemConstants.AccountStatuses.Active;
                await _notifications.CreateAsync(
                    "Account Activated",
                    "Your ABEC student account has been activated. Sign in using your Security PIN.",
                    studentId: student.StudentId,
                    cancellationToken: cancellationToken);
                updated++;
            }
            else
            {
                // Bulk deactivate requires an archive reason via dedicated deactivate endpoint.
                return ApiResponse<object>.Fail(
                    "To deactivate accounts, use Deactivate with an archive reason so the student is moved to Archive.");
            }
        }

        await _db.SaveChangesAsync(cancellationToken);
        return ApiResponse<object>.Ok(new { updated }, "Bulk activation update completed.");
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
            pin = $"ABEC{Random.Shared.Next(100000, 999999)}";
        } while (await _db.Students.AnyAsync(s => s.SecurityPin == pin && s.StudentId != studentId, cancellationToken));
        return pin;
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
        Address = s.Applicant?.Address ?? string.Empty,
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
