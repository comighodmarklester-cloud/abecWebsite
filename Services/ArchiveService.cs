using ABEC_System.Constants;
using ABEC_System.Data;
using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using ABEC_System.Models;
using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Services;

public class ArchiveService : IArchiveService
{
    private readonly ApplicationDbContext _db;
    private readonly INotificationService _notifications;

    public ArchiveService(ApplicationDbContext db, INotificationService notifications)
    {
        _db = db;
        _notifications = notifications;
    }

    public async Task<ApiResponse<IReadOnlyList<ArchiveDto>>> GetAllAsync(string? reason = null, CancellationToken cancellationToken = default, int? batchId = null)
    {
        var query = BaseQuery();
        var selectedBatchId = await _db.ResolveReadBatchIdAsync(batchId, cancellationToken);
        query = query.Where(a => a.Student!.BatchId == selectedBatchId);

        if (!string.IsNullOrWhiteSpace(reason) && !string.Equals(reason, "all", StringComparison.OrdinalIgnoreCase))
        {
            var canonical = SystemConstants.ArchiveReasons.Normalize(reason);
            if (canonical is null)
                return ApiResponse<IReadOnlyList<ArchiveDto>>.Fail("Invalid archive reason.");
            query = query.Where(a => a.ArchiveReason == canonical);
        }

        var list = await query.OrderByDescending(a => a.ArchiveDate).ToListAsync(cancellationToken);
        return ApiResponse<IReadOnlyList<ArchiveDto>>.Ok(list.Select(Map).ToList());
    }

    public async Task<ApiResponse<ArchiveDto>> CreateAsync(CreateArchiveDto dto, CancellationToken cancellationToken = default)
        => await ArchiveInternalAsync(dto.StudentId, dto.ArchiveReason, dto.SpecificReason, cancellationToken);

    public async Task<ApiResponse<object>> ArchiveStudentFromCourseAsync(
        int studentId,
        string reason,
        string? specificReason = null,
        CancellationToken cancellationToken = default)
    {
        var result = await ArchiveInternalAsync(studentId, reason, specificReason, cancellationToken);
        return result.Success
            ? ApiResponse<object>.Ok(result.Data!, result.Message)
            : ApiResponse<object>.Fail(result.Message);
    }

    private async Task<ApiResponse<ArchiveDto>> ArchiveInternalAsync(
        int studentId,
        string reason,
        string? specificReason,
        CancellationToken cancellationToken)
    {
        var canonical = SystemConstants.ArchiveReasons.Normalize(reason);
        if (canonical is null)
        {
            return ApiResponse<ArchiveDto>.Fail(
                "Select a reason: Graduated, Deactivated, Academic Dismissal, Withdrawal, Inactive Lead, Rejected Slots, or Others.");
        }

        var detail = (specificReason ?? string.Empty).Trim();
        if (detail.Length > 500) return ApiResponse<ArchiveDto>.Fail("Specific reason must be 500 characters or fewer.");
        if (SystemConstants.ArchiveReasons.RequiresSpecificReason(canonical))
        {
            if (string.IsNullOrWhiteSpace(detail))
                return ApiResponse<ArchiveDto>.Fail("Please specify a reason when selecting Others.");
        }
        else
        {
            detail = string.Empty;
        }

        var student = await _db.Students
            .Include(s => s.Applicant)!.ThenInclude(a => a!.Course)
            .Include(s => s.Batch)
            .FirstOrDefaultAsync(s => s.StudentId == studentId, cancellationToken);

        if (student is null)
            return ApiResponse<ArchiveDto>.Fail("Student not found.");

        // Archive, account state, and notification must succeed together before the graph can count the change.
        await using var transaction = _db.Database.CurrentTransaction is null
            ? await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken) : null;

        // Keep a single archive row per student — update reason/date instead of duplicating.
        var archive = await _db.Archives
            .OrderByDescending(a => a.ArchiveDate)
            .FirstOrDefaultAsync(a => a.StudentId == studentId, cancellationToken);

        if (archive is null)
        {
            archive = new Archive
            {
                StudentId = studentId,
                ArchiveReason = canonical,
                SpecificReason = string.IsNullOrWhiteSpace(detail) ? null : detail,
                ArchiveDate = DateTime.Now
            };
            _db.Archives.Add(archive);
        }
        else
        {
            archive.ArchiveReason = canonical;
            archive.SpecificReason = string.IsNullOrWhiteSpace(detail) ? null : detail;
            archive.ArchiveDate = DateTime.Now;
        }

        student.AccountStatus = SystemConstants.AccountStatuses.Inactive;
        await _db.SaveChangesAsync(cancellationToken);

        var displayReason = SystemConstants.ArchiveReasons.FormatDisplay(canonical, detail);
        await _notifications.CreateAsync(
            "Account Archived",
            $"Your student account has been archived. Reason: {displayReason}.",
            studentId: student.StudentId,
            cancellationToken: cancellationToken);

        if (transaction is not null) await transaction.CommitAsync(cancellationToken);

        archive.Student = student;
        return ApiResponse<ArchiveDto>.Ok(Map(archive), "Student archived successfully.");
    }

    private IQueryable<Archive> BaseQuery()
        => _db.Archives.AsNoTracking()
            .Include(a => a.Student)!.ThenInclude(s => s!.Applicant)!.ThenInclude(ap => ap!.Course)
            .Include(a => a.Student)!.ThenInclude(s => s!.Batch);

    private static ArchiveDto Map(Archive a) => new()
    {
        ArchiveId = a.ArchiveId,
        StudentId = a.StudentId,
        StudentName = a.Student?.Applicant?.FullName ?? string.Empty,
        Email = a.Student?.Applicant?.Email ?? string.Empty,
        ContactNumber = a.Student?.Applicant?.ContactNumber ?? string.Empty,
        Address = AddressFormatting.FullAddress(a.Student?.Applicant),
        CourseName = a.Student?.Applicant?.Course?.CourseName ?? string.Empty,
        BatchName = a.Student?.Batch?.BatchName ?? string.Empty,
        AccountStatus = a.Student?.AccountStatus ?? SystemConstants.AccountStatuses.Inactive,
        ApplicationStatus = a.Student?.Applicant?.ApplicationStatus ?? string.Empty,
        ConfirmationStatus = SystemConstants.ApplicationStatuses.IsConfirmedSlot(a.Student?.Applicant?.ApplicationStatus)
            || a.Student?.Applicant?.ConfirmedAt != null
            ? SystemConstants.ApplicationStatuses.Confirmed
            : (a.Student?.Applicant?.ApplicationStatus ?? "—"),
        ArchiveReason = SystemConstants.ArchiveReasons.Normalize(a.ArchiveReason) ?? a.ArchiveReason,
        SpecificReason = a.SpecificReason,
        ArchiveDate = a.ArchiveDate,
        CreatedAt = a.Student?.CreatedAt
    };
}
