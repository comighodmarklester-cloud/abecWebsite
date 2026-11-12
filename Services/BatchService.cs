using ABEC_System.Constants;
using ABEC_System.Data;
using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using ABEC_System.Models;
using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Services;

public class BatchService : IBatchService
{
    private readonly ApplicationDbContext _db;

    public BatchService(ApplicationDbContext db) => _db = db;

    public async Task<ApiResponse<IReadOnlyList<BatchDto>>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        var batches = await _db.Batches.AsNoTracking()
            .OrderByDescending(b => b.StartDate)
            .ToListAsync(cancellationToken);
        var mapped = new List<BatchDto>();
        foreach (var b in batches)
            mapped.Add(await MapAsync(b, cancellationToken));
        return ApiResponse<IReadOnlyList<BatchDto>>.Ok(mapped);
    }

    public async Task<ApiResponse<BatchDto?>> GetActiveAsync(CancellationToken cancellationToken = default)
    {
        var batch = await _db.Batches.AsNoTracking()
            .FirstOrDefaultAsync(b => b.Status == SystemConstants.BatchStatuses.Active, cancellationToken);
        return ApiResponse<BatchDto?>.Ok(batch is null ? null : await MapAsync(batch, cancellationToken));
    }

    public async Task<ApiResponse<IReadOnlyList<BatchDto>>> GetHistoryAsync(CancellationToken cancellationToken = default)
    {
        var batches = await _db.Batches.AsNoTracking()
            .Where(b => b.Status == SystemConstants.BatchStatuses.Closed)
            .OrderByDescending(b => b.EndDate)
            .ToListAsync(cancellationToken);
        var mapped = new List<BatchDto>();
        foreach (var b in batches)
            mapped.Add(await MapAsync(b, cancellationToken));
        return ApiResponse<IReadOnlyList<BatchDto>>.Ok(mapped);
    }

    public async Task<ApiResponse<BatchSwitchImpactDto>> GetSwitchImpactAsync(
        int? targetBatchId = null,
        CancellationToken cancellationToken = default)
    {
        var current = await _db.Batches.AsNoTracking()
            .FirstOrDefaultAsync(b => b.Status == SystemConstants.BatchStatuses.Active, cancellationToken);

        BatchDto? targetDto = null;
        if (targetBatchId.HasValue)
        {
            var target = await _db.Batches.AsNoTracking()
                .FirstOrDefaultAsync(b => b.BatchId == targetBatchId.Value, cancellationToken);
            if (target is null)
                return ApiResponse<BatchSwitchImpactDto>.Fail("Target batch was not found.");
            if (current is not null && target.BatchId == current.BatchId)
                return ApiResponse<BatchSwitchImpactDto>.Fail("That batch is already the active batch.");
            targetDto = await MapAsync(target, cancellationToken);
        }

        var impact = new BatchSwitchImpactDto
        {
            CurrentActiveBatch = current is null ? null : await MapAsync(current, cancellationToken),
            TargetBatch = targetDto
        };

        if (current is null)
            return ApiResponse<BatchSwitchImpactDto>.Ok(impact);

        var batchId = current.BatchId;

        impact.ActiveEnrolledStudents = await _db.Students.AsNoTracking()
            .CountAsync(s => s.BatchId == batchId && s.AccountStatus == SystemConstants.AccountStatuses.Active, cancellationToken);

        impact.PendingApplicants = await CountApplicantsForBatchAsync(
            batchId,
            SystemConstants.ApplicationStatuses.Pending,
            cancellationToken);

        impact.WaitlistedApplicants = await CountApplicantsForBatchAsync(
            batchId,
            SystemConstants.ApplicationStatuses.Waitlisted,
            cancellationToken);

        impact.AwaitingConfirmation = await _db.Applicants.AsNoTracking()
            .CountAsync(a =>
                a.BatchId == batchId &&
                a.ApplicationStatus == SystemConstants.ApplicationStatuses.Approved &&
                (a.SlotResponse == SystemConstants.SlotResponses.AwaitingResponse ||
                 a.SlotResponse == SystemConstants.SlotResponses.AwaitingFromWaitlist ||
                 (a.ConfirmationToken != null && a.ConfirmedAt == null && a.DeclinedAt == null)),
                cancellationToken);

        var archivedStudentIds = await _db.Archives.AsNoTracking()
            .Select(a => a.StudentId)
            .ToListAsync(cancellationToken);
        var archivedSet = archivedStudentIds.ToHashSet();

        var pendingActivationIds = await _db.Students.AsNoTracking()
            .Where(s => s.BatchId == batchId && s.AccountStatus == SystemConstants.AccountStatuses.Inactive)
            .Select(s => s.StudentId)
            .ToListAsync(cancellationToken);
        impact.PendingActivations = pendingActivationIds.Count(id => !archivedSet.Contains(id));

        impact.ActiveCourseSchedules = await _db.CourseSchedules.AsNoTracking()
            .CountAsync(s => s.BatchId == batchId && s.Status == SystemConstants.ScheduleStatuses.Active, cancellationToken);

        var openDocStatuses = new[]
        {
            SystemConstants.DocumentStatuses.Pending,
            SystemConstants.DocumentStatuses.Processing,
            SystemConstants.DocumentStatuses.OnHold,
            SystemConstants.DocumentStatuses.ReadyForRelease
        };

        impact.PendingDocumentRequests = await _db.DocumentRequests.AsNoTracking()
            .Where(d => openDocStatuses.Contains(d.RequestStatus))
            .Join(_db.Students.AsNoTracking().Where(s => s.BatchId == batchId),
                d => d.StudentId,
                s => s.StudentId,
                (d, s) => d)
            .CountAsync(cancellationToken);

        return ApiResponse<BatchSwitchImpactDto>.Ok(impact);
    }

    public async Task<ApiResponse<IReadOnlyList<StudentDto>>> GetStudentsAsync(
        int batchId,
        CancellationToken cancellationToken = default)
    {
        var exists = await _db.Batches.AsNoTracking().AnyAsync(b => b.BatchId == batchId, cancellationToken);
        if (!exists)
            return ApiResponse<IReadOnlyList<StudentDto>>.Fail("Batch not found.");

        var students = await _db.Students.AsNoTracking()
            .Include(s => s.Applicant)!.ThenInclude(a => a!.Course)
            .Include(s => s.Batch)
            .Where(s => s.BatchId == batchId)
            .OrderBy(s => s.Applicant!.LastName)
            .ThenBy(s => s.Applicant!.FirstName)
            .ToListAsync(cancellationToken);

        var archivedIds = (await _db.Archives.AsNoTracking()
            .Where(a => students.Select(s => s.StudentId).Contains(a.StudentId))
            .Select(a => a.StudentId)
            .ToListAsync(cancellationToken)).ToHashSet();

        return ApiResponse<IReadOnlyList<StudentDto>>.Ok(students.Select(s => MapStudent(s, archivedIds)).ToList());
    }

    public async Task<ApiResponse<BatchDto>> CreateAsync(CreateBatchDto dto, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(dto.BatchName))
            return ApiResponse<BatchDto>.Fail("Batch name is required.");
        var today = TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, "Asia/Manila").Date;
        if (dto.StartDate.Date < today)
            return ApiResponse<BatchDto>.Fail("Start date cannot be in the past.");
        if (dto.EndDate.Date < dto.StartDate.Date)
            return ApiResponse<BatchDto>.Fail("End date must be on or after the start date.");

        if (dto.ActivateNow && !dto.ConfirmSwitch)
            return ApiResponse<BatchDto>.Fail("You must acknowledge the batch switch warning before activating a new batch.");

        if (dto.CompleteBatchId.HasValue && !dto.ActivateNow)
            return ApiResponse<BatchDto>.Fail("A replacement batch must be activated to complete the current batch.");

        await using var transaction = await _db.Database.BeginTransactionAsync(
            System.Data.IsolationLevel.Serializable, cancellationToken);
        Batch? completing = null;
        if (dto.CompleteBatchId.HasValue)
        {
            completing = await _db.Batches.FirstOrDefaultAsync(
                b => b.BatchId == dto.CompleteBatchId.Value && b.Status == SystemConstants.BatchStatuses.Active,
                cancellationToken);
            if (completing is null)
                return ApiResponse<BatchDto>.Fail("The active batch has changed. Refresh and try again.");
        }

        var batch = new Batch
        {
            BatchName = dto.BatchName.Trim(),
            StartDate = dto.StartDate.Date,
            EndDate = dto.EndDate.Date,
            Status = SystemConstants.BatchStatuses.Draft
        };

        _db.Batches.Add(batch);
        await _db.SaveChangesAsync(cancellationToken);

        _db.BatchHistories.Add(new BatchHistory
        {
            BatchId = batch.BatchId,
            Action = "Batch Created",
            ActionDate = DateTime.Now
        });
        await _db.SaveChangesAsync(cancellationToken);

        if (dto.ActivateNow)
        {
            if (completing is not null)
            {
                completing.Status = SystemConstants.BatchStatuses.Completed;
                completing.CompletedAt ??= DateTime.UtcNow;
                _db.BatchHistories.Add(new BatchHistory
                {
                    BatchId = completing.BatchId,
                    Action = "Batch Completed",
                    ActionDate = DateTime.Now
                });
                await _db.SaveChangesAsync(cancellationToken);
            }
            var activated = await ActivateAsync(batch.BatchId, confirmSwitch: true, cancellationToken);
            if (!activated.Success)
                return activated;
            await transaction.CommitAsync(cancellationToken);
            return ApiResponse<BatchDto>.Ok(activated.Data!, "New batch created and set as the active semester.");
        }

        var mapped = await MapAsync(batch, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return ApiResponse<BatchDto>.Ok(mapped, "Batch created. Activate it to start a new semester.");
    }

    public async Task<ApiResponse<BatchDto>> ActivateAsync(
        int batchId,
        bool confirmSwitch,
        CancellationToken cancellationToken = default)
    {
        if (!confirmSwitch)
            return ApiResponse<BatchDto>.Fail("You must acknowledge the batch switch warning before continuing.");

        await using var activationTransaction = _db.Database.CurrentTransaction is null
            ? await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken) : null;
        var batch = await _db.Batches
            .FirstOrDefaultAsync(b => b.BatchId == batchId, cancellationToken);
        if (batch is null)
            return ApiResponse<BatchDto>.Fail("Batch not found.");

        if (batch.Status == SystemConstants.BatchStatuses.Active)
            return ApiResponse<BatchDto>.Ok(await MapAsync(batch, cancellationToken), "Batch is already active.");

        if (batch.Status is "Completed" or "Closed" || await _db.BatchHistories.AnyAsync(h => h.BatchId == batchId && (h.Action == "Batch Completed" || h.Action == "Moved to Batch History" || h.Action == "Batch Activated" || h.Action == "Restored as Active Batch"), cancellationToken)
            || await _db.Applicants.AnyAsync(a => a.BatchId == batchId, cancellationToken)
            || await _db.Students.AnyAsync(s => s.BatchId == batchId, cancellationToken))
            return ApiResponse<BatchDto>.Fail("Completed batches are view-only and cannot be reactivated. Create a new batch instead.");

        var currentActive = await _db.Batches
            .Where(b => b.Status == SystemConstants.BatchStatuses.Active && b.BatchId != batchId)
            .ToListAsync(cancellationToken);

        foreach (var active in currentActive)
        {
            // Preserve all associated records — only flip status and write history.
            active.Status = SystemConstants.BatchStatuses.Completed;
            active.CompletedAt ??= DateTime.UtcNow;
            _db.BatchHistories.Add(new BatchHistory
            {
                BatchId = active.BatchId,
                Action = "Moved to Batch History",
                ActionDate = DateTime.Now
            });
        }

        if (currentActive.Count > 0) await _db.SaveChangesAsync(cancellationToken);
        batch.Status = SystemConstants.BatchStatuses.Active;
        _db.BatchHistories.Add(new BatchHistory
        {
            BatchId = batch.BatchId,
            Action = currentActive.Count > 0 ? "Restored as Active Batch" : "Batch Activated",
            ActionDate = DateTime.Now
        });

        await _db.SaveChangesAsync(cancellationToken);
        if (activationTransaction is not null) await activationTransaction.CommitAsync(cancellationToken);
        return ApiResponse<BatchDto>.Ok(
            await MapAsync(batch, cancellationToken),
            currentActive.Count > 0
                ? "Previous active batch moved to Batch History. Selected batch is now active. No records were deleted."
                : "Batch activated. New applicants and related records will use this semester.");
    }

    public async Task<ApiResponse<BatchDto>> CompleteAsync(int batchId, CancellationToken cancellationToken = default)
    {
        await using var transaction = await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
        var batch = await _db.Batches
            .FirstOrDefaultAsync(b => b.BatchId == batchId, cancellationToken);
        if (batch is null)
            return ApiResponse<BatchDto>.Fail("Batch not found.");

        if (batch.Status == SystemConstants.BatchStatuses.Closed)
            return ApiResponse<BatchDto>.Ok(await MapAsync(batch, cancellationToken), "Batch is already in history.");
        if (batch.Status != SystemConstants.BatchStatuses.Active)
            return ApiResponse<BatchDto>.Fail("Only the active batch can be completed.");

        batch.Status = SystemConstants.BatchStatuses.Completed;
        batch.CompletedAt ??= DateTime.UtcNow;
        _db.BatchHistories.Add(new BatchHistory
        {
            BatchId = batch.BatchId,
            Action = "Batch Completed",
            ActionDate = DateTime.Now
        });
        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return ApiResponse<BatchDto>.Ok(
            await MapAsync(batch, cancellationToken),
            "Batch completed and moved to Batch History. All associated records were preserved.");
    }

    private async Task<int> CountApplicantsForBatchAsync(
        int batchId,
        string status,
        CancellationToken cancellationToken)
    {
        return await _db.Applicants.AsNoTracking()
            .CountAsync(a =>
                a.BatchId == batchId &&
                a.ApplicationStatus == status,
                cancellationToken);
    }

    private async Task<BatchDto> MapAsync(Batch b, CancellationToken cancellationToken)
    {
        var studentCount = await _db.Students.AsNoTracking()
            .CountAsync(s => s.BatchId == b.BatchId, cancellationToken);
        var activeStudents = await _db.Students.AsNoTracking()
            .CountAsync(s => s.BatchId == b.BatchId && s.AccountStatus == SystemConstants.AccountStatuses.Active, cancellationToken);
        var activeSchedules = await _db.CourseSchedules.AsNoTracking()
            .CountAsync(s => s.BatchId == b.BatchId && s.Status == SystemConstants.ScheduleStatuses.Active, cancellationToken);

        return new BatchDto
        {
            CompletedAt = b.CompletedAt,
            BatchId = b.BatchId,
            BatchName = b.BatchName,
            StartDate = b.StartDate,
            EndDate = b.EndDate,
            Status = b.Status,
            UnreadDocumentNotifications = await _db.Notifications.AsNoTracking().CountAsync(n => n.StudentId == null && (n.RequestId != null || n.CourseDocumentId != null) && n.Status == "Unread" && n.BatchId == b.BatchId, cancellationToken),
            StudentCount = studentCount,
            ActiveStudentCount = activeStudents,
            ActiveScheduleCount = activeSchedules
        };
    }

    private static StudentDto MapStudent(Student s, HashSet<int> archivedIds)
    {
        var a = s.Applicant;
        return new StudentDto
        {
            StudentId = s.StudentId,
            ApplicantId = s.ApplicantId,
            FullName = a?.FullName ?? string.Empty,
            Email = a?.Email ?? string.Empty,
            ContactNumber = a?.ContactNumber ?? string.Empty,
            Address = a?.Address ?? string.Empty,
            CourseName = a?.Course?.CourseName ?? string.Empty,
            CourseId = a?.CourseId ?? 0,
            CourseDuration = a?.Course?.Duration ?? string.Empty,
            BatchId = s.BatchId,
            BatchName = s.Batch?.BatchName ?? string.Empty,
            BatchStartDate = s.Batch?.StartDate,
            BatchEndDate = s.Batch?.EndDate,
            SecurityPin = s.SecurityPin,
            AccountStatus = s.AccountStatus,
            ApplicationStatus = a?.ApplicationStatus ?? string.Empty,
            ConfirmationStatus = a?.SlotResponse ?? string.Empty,
            ApplicationDate = a?.ApplicationDate,
            ConfirmedAt = a?.ConfirmedAt,
            CreatedAt = s.CreatedAt,
            IsArchived = archivedIds.Contains(s.StudentId)
        };
    }
}
