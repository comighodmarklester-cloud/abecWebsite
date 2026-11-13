using ABEC_System.Constants;
using ABEC_System.Data;
using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using ABEC_System.Models;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace ABEC_System.Services;

public class ScheduleService : IScheduleService
{
    public static bool TrainingRoomAllowed(string? courseName, string? roomName)
        => !(courseName?.Contains("bookkeep", StringComparison.OrdinalIgnoreCase) == true
            && System.Text.RegularExpressions.Regex.IsMatch(roomName ?? "", @"\b(?:room|lab)\s*301\b", System.Text.RegularExpressions.RegexOptions.IgnoreCase));

    private readonly ApplicationDbContext _db;
    private readonly INotificationService _notifications;
    private readonly CourseHistoryRecorder _history;

    public ScheduleService(ApplicationDbContext db, INotificationService notifications, CourseHistoryRecorder history)
    {
        _db = db;
        _notifications = notifications;
        _history = history;
    }

    public async Task<ApiResponse<IReadOnlyList<CourseScheduleDto>>> GetAllAsync(
        int? courseId = null,
        int? batchId = null,
        string? status = null,
        CancellationToken cancellationToken = default)
    {
        var query = _db.CourseSchedules.AsNoTracking()
            .Include(s => s.Course)
            .Include(s => s.Batch)
            .AsQueryable();

        if (courseId.HasValue) query = query.Where(s => s.CourseId == courseId.Value);
        var selectedBatchId = await _db.ResolveReadBatchIdAsync(batchId, cancellationToken);
        query = query.Where(s => s.BatchId == selectedBatchId);

        if (!string.IsNullOrWhiteSpace(status))
        {
            var normalized = SystemConstants.ScheduleStatuses.Normalize(status);
            query = query.Where(s => s.Status == normalized);
        }

        var list = await query
            .OrderByDescending(s => s.Status == SystemConstants.ScheduleStatuses.Active)
            .ThenBy(s => s.ScheduleDate)
            .ThenBy(s => s.StartTime)
            .ToListAsync(cancellationToken);
        return ApiResponse<IReadOnlyList<CourseScheduleDto>>.Ok(list.Select(Map).ToList());
    }

    public async Task<ApiResponse<CourseScheduleDto>> CreateAsync(CreateScheduleDto dto, CancellationToken cancellationToken = default)
    {
        await using var transaction = _db.Database.CurrentTransaction is null
            ? await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken) : null;
        await _db.RequireActiveBatchAsync(dto.BatchId, cancellationToken);
        var earliestDate = DateTime.Now.Date.AddMonths(-3) > new DateTime(DateTime.Now.Year, 1, 1)
            ? DateTime.Now.Date.AddMonths(-3)
            : new DateTime(DateTime.Now.Year, 1, 1);
        if (dto.ScheduleDate.Date < earliestDate || dto.ScheduleDate.Year != DateTime.Now.Year)
            return ApiResponse<CourseScheduleDto>.Fail($"Start date must be between {earliestDate:MMMM d, yyyy} and today.");
        if (dto.EndTime <= dto.StartTime)
            return ApiResponse<CourseScheduleDto>.Fail("End time must be after start time.");

        if (string.IsNullOrWhiteSpace(dto.Room))
            return ApiResponse<CourseScheduleDto>.Fail("Training room is required.");

        if (string.IsNullOrWhiteSpace(dto.Trainer))
            return ApiResponse<CourseScheduleDto>.Fail("Assigned trainer is required.");

        var room = await FindRoomAsync(dto.Room, cancellationToken);
        if (room is null)
            return ApiResponse<CourseScheduleDto>.Fail("Select a registered training room.");
        dto.Room = room.RoomName;
        var courseName = await _db.Courses.Where(c => c.CourseId == dto.CourseId).Select(c => c.CourseName).SingleOrDefaultAsync(cancellationToken);
        if (courseName is null) return ApiResponse<CourseScheduleDto>.Fail("Course not found.");
        if (!TrainingRoomAllowed(courseName, dto.Room))
            return ApiResponse<CourseScheduleDto>.Fail("Room 301 Computer Lab is not available for Bookkeeping.");

        var assignments = NormalizeTrainers(dto.Trainers, dto.Trainer);
        if (assignments.Count == 0)
            return ApiResponse<CourseScheduleDto>.Fail("Assigned trainer is required.");
        dto.Trainer = assignments[0].Name;

        var status = SystemConstants.ScheduleStatuses.Normalize(dto.Status);

        var activeGuard = await EnsureSingleActiveAsync(dto.CourseId, status, dto.ReplaceScheduleId, cancellationToken);
        if (!activeGuard.Success)
            return ApiResponse<CourseScheduleDto>.Fail(activeGuard.Message);

        var conflict = await HasConflictAsync(dto, dto.ReplaceScheduleId, cancellationToken);
        if (!conflict.Success || conflict.Data)
            return ApiResponse<CourseScheduleDto>.Fail(conflict.Message ?? "Schedule conflict detected for the selected trainer, room, or time slot.");

        var entity = new CourseSchedule
        {
            CourseId = dto.CourseId,
            BatchId = dto.BatchId,
            ScheduleDate = dto.ScheduleDate.Date,
            StartTime = dto.StartTime,
            EndTime = dto.EndTime,
            Room = room.RoomName,
            RoomId = room.RoomId,
            Trainer = dto.Trainer.Trim(),
            TrainerAssignments = JsonSerializer.Serialize(assignments),
            TrainingDays = NormalizeTrainingDays(dto.TrainingDays) ?? string.Empty,
            Status = status
        };

        if (string.IsNullOrWhiteSpace(entity.TrainingDays))
            return ApiResponse<CourseScheduleDto>.Fail("Select at least one training day.");

        CourseSchedule? replaced = null;
        if (dto.ReplaceScheduleId.HasValue && SystemConstants.ScheduleStatuses.IsActive(status))
        {
            replaced = await _db.CourseSchedules.FirstOrDefaultAsync(s => s.ScheduleId == dto.ReplaceScheduleId.Value && s.CourseId == dto.CourseId && s.BatchId == dto.BatchId && s.Status == SystemConstants.ScheduleStatuses.Active, cancellationToken);
            if (replaced is null)
                return ApiResponse<CourseScheduleDto>.Fail("The active schedule is no longer available to replace. Refresh and try again.");
        }
        _db.CourseSchedules.Add(entity);
        var createdCourseName = await _db.Courses.AsNoTracking()
            .Where(c => c.CourseId == dto.CourseId)
            .Select(c => c.CourseName)
            .FirstOrDefaultAsync(cancellationToken) ?? "Course";
        await _history.AddAsync(
            dto.CourseId,
            createdCourseName,
            replaced is null ? "Schedule created" : "Schedule replaced",
            replaced is null ? null : DescribeSchedule(replaced.ScheduleDate, replaced.StartTime, replaced.EndTime, replaced.Trainer, replaced.Room, replaced.Status),
            DescribeSchedule(entity.ScheduleDate, entity.StartTime, entity.EndTime, entity.Trainer, entity.Room, entity.Status),
            cancellationToken);
        if (replaced is not null) replaced.Status = SystemConstants.ScheduleStatuses.Inactive;
        await _db.SaveChangesAsync(cancellationToken);
        await _db.Entry(entity).Reference(s => s.Course).LoadAsync(cancellationToken);
        await _db.Entry(entity).Reference(s => s.Batch).LoadAsync(cancellationToken);

        var students = await _db.Students.AsNoTracking()
            .Include(s => s.Applicant)
            .Where(s => s.Applicant!.CourseId == dto.CourseId && s.BatchId == dto.BatchId)
            .Select(s => s.StudentId)
            .ToListAsync(cancellationToken);

        if (SystemConstants.ScheduleStatuses.IsActive(status))
        {
            var message = $"Your course schedule is now active: {entity.Course?.CourseName} on {entity.ScheduleDate:MMMM dd, yyyy} ({entity.StartTime:hh\\:mm}-{entity.EndTime:hh\\:mm}) with {entity.Trainer} in {entity.Room}.";
            foreach (var studentId in students)
            {
                await _notifications.CreateAsync(
                    "Active Class Schedule Updated",
                    message,
                    studentId: studentId,
                    cancellationToken: cancellationToken);
            }
        }
        else
        {
            var message = $"A new class schedule was created for {entity.Course?.CourseName} on {entity.ScheduleDate:MMMM dd, yyyy} ({entity.StartTime:hh\\:mm}-{entity.EndTime:hh\\:mm}) with {entity.Trainer} in {entity.Room}.";
            foreach (var studentId in students)
            {
                await _notifications.CreateAsync(
                    "Class Schedule Created",
                    message,
                    studentId: studentId,
                    cancellationToken: cancellationToken);
            }
        }

        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return ApiResponse<CourseScheduleDto>.Ok(Map(entity),
            SystemConstants.ScheduleStatuses.IsActive(status)
                ? "Active schedule saved. Enrolled students can now see it on their dashboard."
                : "Schedule created.");
    }

    public async Task<ApiResponse<CourseScheduleDto>> UpdateAsync(int id, UpdateScheduleDto dto, CancellationToken cancellationToken = default)
    {
        await using var transaction = _db.Database.CurrentTransaction is null
            ? await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken) : null;
        var entity = await _db.CourseSchedules
            .Include(s => s.Course)
            .Include(s => s.Batch)
            .FirstOrDefaultAsync(s => s.ScheduleId == id, cancellationToken);
        if (entity is null)
            return ApiResponse<CourseScheduleDto>.Fail("Schedule not found.");

        await _db.RequireActiveBatchAsync(entity.BatchId, cancellationToken);
        if (dto.BatchId.HasValue && dto.BatchId != entity.BatchId)
            throw new BatchIntegrityException("An existing schedule cannot be moved to another batch.", "batchId");

        var earliestDate = DateTime.Now.Date.AddMonths(-3) > new DateTime(DateTime.Now.Year, 1, 1)
            ? DateTime.Now.Date.AddMonths(-3)
            : new DateTime(DateTime.Now.Year, 1, 1);
        if (dto.ScheduleDate.HasValue && (dto.ScheduleDate.Value.Date < earliestDate || dto.ScheduleDate.Value.Year != DateTime.Now.Year))
            return ApiResponse<CourseScheduleDto>.Fail($"Start date must be between {earliestDate:MMMM d, yyyy} and today.");

        if (!TrainingRoomAllowed(entity.Course?.CourseName, dto.Room ?? entity.Room))
            return ApiResponse<CourseScheduleDto>.Fail("Room 301 Computer Lab is not available for Bookkeeping.");

        var beforeDate = entity.ScheduleDate.Date;
        var beforeStart = entity.StartTime;
        var beforeEnd = entity.EndTime;
        var beforeRoom = entity.Room ?? string.Empty;
        var beforeTrainer = entity.Trainer ?? string.Empty;
        var beforeDays = entity.TrainingDays ?? string.Empty;
        var beforeStatus = entity.Status ?? string.Empty;
        var beforeBatchId = entity.BatchId;

        if (dto.ScheduleDate.HasValue) entity.ScheduleDate = dto.ScheduleDate.Value.Date;
        if (dto.StartTime.HasValue) entity.StartTime = dto.StartTime.Value;
        if (dto.EndTime.HasValue) entity.EndTime = dto.EndTime.Value;
        if (!string.IsNullOrWhiteSpace(dto.Room))
        {
            var room = await FindRoomAsync(dto.Room, cancellationToken);
            if (room is null)
                return ApiResponse<CourseScheduleDto>.Fail("Select a registered training room.");
            entity.Room = room.RoomName;
            entity.RoomId = room.RoomId;
        }
        if (!string.IsNullOrWhiteSpace(dto.Trainer))
        {
            entity.Trainer = dto.Trainer.Trim();
            if (dto.Trainers is null)
                entity.TrainerAssignments = JsonSerializer.Serialize(new[] { new TrainerAssignmentDto { Name = entity.Trainer } });
        }
        if (dto.Trainers is not null)
        {
            var assignments = NormalizeTrainers(dto.Trainers, entity.Trainer);
            if (assignments.Count == 0) return ApiResponse<CourseScheduleDto>.Fail("Assigned trainer is required.");
            entity.Trainer = assignments[0].Name;
            entity.TrainerAssignments = JsonSerializer.Serialize(assignments);
        }
        if (dto.TrainingDays != null)
        {
            var days = NormalizeTrainingDays(dto.TrainingDays);
            if (string.IsNullOrWhiteSpace(days))
                return ApiResponse<CourseScheduleDto>.Fail("Select at least one training day.");
            entity.TrainingDays = days;
        }
        if (dto.BatchId.HasValue) entity.BatchId = dto.BatchId.Value;

        var previousStatus = entity.Status;
        if (!string.IsNullOrWhiteSpace(dto.Status))
            entity.Status = SystemConstants.ScheduleStatuses.Normalize(dto.Status);

        if (entity.EndTime <= entity.StartTime)
            return ApiResponse<CourseScheduleDto>.Fail("End time must be after start time.");

        var activeGuard = await EnsureSingleActiveAsync(entity.CourseId, entity.Status, entity.ScheduleId, cancellationToken);
        if (!activeGuard.Success)
            return ApiResponse<CourseScheduleDto>.Fail(activeGuard.Message);

        var conflictCheck = await HasConflictAsync(new CreateScheduleDto
        {
            CourseId = entity.CourseId,
            BatchId = entity.BatchId,
            ScheduleDate = entity.ScheduleDate,
            StartTime = entity.StartTime,
            EndTime = entity.EndTime,
            Room = entity.Room ?? string.Empty,
            Trainer = entity.Trainer ?? string.Empty,
            Status = entity.Status ?? SystemConstants.ScheduleStatuses.Inactive
        }, id, cancellationToken);

        if (!conflictCheck.Success || conflictCheck.Data)
            return ApiResponse<CourseScheduleDto>.Fail(conflictCheck.Message ?? "Schedule conflict detected for the selected trainer, room, or time slot.");

        var changes = new List<(string Action, string Label, string Previous, string New)>();
        AddScheduleChange(changes, "Schedule date updated", "Date", beforeDate.ToString("MMM dd, yyyy"), entity.ScheduleDate.ToString("MMM dd, yyyy"));
        AddScheduleChange(changes, "Schedule time updated", "Time", $"{beforeStart:hh\\:mm}-{beforeEnd:hh\\:mm}", $"{entity.StartTime:hh\\:mm}-{entity.EndTime:hh\\:mm}");
        AddScheduleChange(changes, "Trainer updated", "Trainer", beforeTrainer, entity.Trainer ?? string.Empty);
        AddScheduleChange(changes, "Training days updated", "Days", beforeDays, entity.TrainingDays ?? string.Empty);
        AddScheduleChange(changes, "Training room updated", "Room", beforeRoom, entity.Room ?? string.Empty);
        AddScheduleChange(changes, "Schedule status updated", "Status", beforeStatus, entity.Status ?? string.Empty);
        if (beforeBatchId != entity.BatchId)
            changes.Add(("Batch updated", "Batch", beforeBatchId.ToString(), entity.BatchId.ToString()));

        if (changes.Count > 0)
        {
            var action = changes.Count == 1 ? changes[0].Action : "Schedule updated";
            var previous = changes.Count == 1
                ? changes[0].Previous
                : string.Join("; ", changes.Select(c => c.Label + ": " + c.Previous));
            var updated = changes.Count == 1
                ? changes[0].New
                : string.Join("; ", changes.Select(c => c.Label + ": " + c.New));
            await _history.AddAsync(entity.CourseId, entity.Course?.CourseName ?? "Course", action, previous, updated, cancellationToken);
        }

        await _db.SaveChangesAsync(cancellationToken);

        var becameActive = SystemConstants.ScheduleStatuses.IsActive(entity.Status)
            && !SystemConstants.ScheduleStatuses.IsActive(previousStatus);
        if (becameActive || (SystemConstants.ScheduleStatuses.IsActive(entity.Status) && SystemConstants.ScheduleStatuses.IsActive(previousStatus)))
        {
            var students = await _db.Students.AsNoTracking()
                .Include(s => s.Applicant)
                .Where(s => s.Applicant!.CourseId == entity.CourseId && s.BatchId == entity.BatchId)
                .Select(s => s.StudentId)
                .ToListAsync(cancellationToken);

            var message = $"Your active course schedule was updated: {entity.Course?.CourseName} on {entity.ScheduleDate:MMMM dd, yyyy} ({entity.StartTime:hh\\:mm}-{entity.EndTime:hh\\:mm}) with {entity.Trainer} in {entity.Room}.";
            foreach (var studentId in students)
            {
                await _notifications.CreateAsync(
                    "Active Class Schedule Updated",
                    message,
                    studentId: studentId,
                    cancellationToken: cancellationToken);
            }
        }

        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return ApiResponse<CourseScheduleDto>.Ok(Map(entity), "Schedule updated.");
    }

    public async Task<ApiResponse<object>> DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        await using var transaction = _db.Database.CurrentTransaction is null
            ? await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken) : null;
        var entity = await _db.CourseSchedules.Include(s => s.Course)
            .FirstOrDefaultAsync(s => s.ScheduleId == id, cancellationToken);
        if (entity is null)
            return ApiResponse<object>.Fail("Schedule not found.");

        await _history.AddAsync(
            entity.CourseId,
            entity.Course?.CourseName ?? "Course",
            "Schedule removed",
            DescribeSchedule(entity.ScheduleDate, entity.StartTime, entity.EndTime, entity.Trainer, entity.Room, entity.Status),
            "Removed",
            cancellationToken);
        await _db.RequireActiveBatchAsync(entity.BatchId, cancellationToken);
        _db.CourseSchedules.Remove(entity);
        await _db.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return ApiResponse<object>.Ok(new { deleted = true }, "Schedule deleted.");
    }

    public async Task<ApiResponse<bool>> HasConflictAsync(CreateScheduleDto dto, int? excludeScheduleId = null, CancellationToken cancellationToken = default)
    {
        var room = (dto.Room ?? string.Empty).Trim();
        var trainer = (dto.Trainer ?? string.Empty).Trim();
        var registered = await FindRoomAsync(room, cancellationToken);
        if (registered is not null) room = registered.RoomName;

        var query = _db.CourseSchedules.AsNoTracking()
            .Include(s => s.Course)
            .Where(s => s.Status == SystemConstants.ScheduleStatuses.Active && s.Batch!.Status == "Active"
                        && (s.Room == room || (!string.IsNullOrWhiteSpace(trainer) && s.Trainer == trainer)));

        if (excludeScheduleId.HasValue)
            query = query.Where(s => s.ScheduleId != excludeScheduleId.Value);

        var matches = await query.ToListAsync(cancellationToken);
        var roomConflict = matches.FirstOrDefault(s => string.Equals(s.Room, room, StringComparison.OrdinalIgnoreCase));
        if (roomConflict is not null)
            return ApiResponse<bool>.Fail($"{room} is currently being used by the active schedule for ‘{roomConflict.Course?.CourseName ?? "another course"}’ and is unavailable.");
        var conflict = matches.Any(s => s.ScheduleDate.Date == dto.ScheduleDate.Date && TimesOverlap(s.StartTime, s.EndTime, dto.StartTime, dto.EndTime));
        return ApiResponse<bool>.Ok(conflict, conflict ? "Schedule conflict detected for the selected trainer or time slot." : "No conflict.");
    }

    private async Task<ApiResponse<object>> EnsureSingleActiveAsync(
        int courseId,
        string? status,
        int? excludeScheduleId,
        CancellationToken cancellationToken)
    {
        if (!SystemConstants.ScheduleStatuses.IsActive(status))
            return ApiResponse<object>.Ok(new { });

        var query = _db.CourseSchedules.AsNoTracking()
            .Include(s => s.Course)
            .Where(s => s.CourseId == courseId && s.Status == SystemConstants.ScheduleStatuses.Active && s.Batch!.Status == "Active");

        if (excludeScheduleId.HasValue)
            query = query.Where(s => s.ScheduleId != excludeScheduleId.Value);

        var existing = await query.OrderBy(s => s.ScheduleDate).FirstOrDefaultAsync(cancellationToken);
        if (existing is null)
            return ApiResponse<object>.Ok(new { });

        var courseName = existing.Course?.CourseName ?? "this course";
        return ApiResponse<object>.Fail(
            $"Only one Active schedule is allowed per course. \"{courseName}\" already has an Active schedule on {existing.ScheduleDate:MMM dd, yyyy} ({existing.StartTime:hh\\:mm}-{existing.EndTime:hh\\:mm}) with {existing.Trainer} in {existing.Room}. Deactivate that schedule first, then set this one to Active.");
    }

    private static void AddScheduleChange(
        List<(string Action, string Label, string Previous, string New)> changes,
        string action,
        string label,
        string previous,
        string updated)
    {
        if (string.Equals(previous?.Trim(), updated?.Trim(), StringComparison.Ordinal)) return;
        changes.Add((action, label, string.IsNullOrWhiteSpace(previous) ? "—" : previous.Trim(), string.IsNullOrWhiteSpace(updated) ? "—" : updated.Trim()));
    }

    private static string DescribeSchedule(DateTime date, TimeSpan start, TimeSpan end, string? trainer, string? room, string? status)
        => $"{date:MMM dd, yyyy}; {start:hh\\:mm}-{end:hh\\:mm}; {trainer}; {room}; {status}";

    private static string? NormalizeTrainingDays(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var allowed = new[] { "Mon", "Tue", "Wed", "Thu", "Fri" };
        var parts = value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var picked = allowed.Where(day => parts.Contains(day, StringComparer.OrdinalIgnoreCase)).ToArray();
        return picked.Length == 0 ? null : string.Join(",", picked);
    }

    private async Task<TrainingRoom?> FindRoomAsync(string? name, CancellationToken cancellationToken)
    {
        var key = (name ?? string.Empty).Trim();
        if (key.Length == 0) return null;
        var rooms = await _db.TrainingRooms.AsNoTracking().ToListAsync(cancellationToken);
        return rooms.FirstOrDefault(room => string.Equals(room.RoomName.Trim(), key, StringComparison.OrdinalIgnoreCase));
    }

    private static bool TimesOverlap(TimeSpan aStart, TimeSpan aEnd, TimeSpan bStart, TimeSpan bEnd)
        => aStart < bEnd && bStart < aEnd;

    internal static CourseScheduleDto Map(CourseSchedule s) => new()
    {
        ScheduleId = s.ScheduleId,
        CourseId = s.CourseId,
        CourseName = s.Course?.CourseName ?? string.Empty,
        BatchId = s.BatchId,
        BatchName = s.Batch?.BatchName ?? string.Empty,
        BatchStartDate = s.Batch?.StartDate,
        BatchEndDate = s.Batch?.EndDate,
        ScheduleDate = s.ScheduleDate,
        StartTime = s.StartTime,
        EndTime = s.EndTime,
        Room = s.Room,
        Trainer = s.Trainer,
        Trainers = DeserializeTrainers(s.TrainerAssignments, s.Trainer),
        TrainingDays = s.TrainingDays,
        Status = string.IsNullOrWhiteSpace(s.Status) ? SystemConstants.ScheduleStatuses.Inactive : s.Status
    };

    private static List<TrainerAssignmentDto> NormalizeTrainers(IEnumerable<TrainerAssignmentDto>? trainers, string? fallback)
    {
        var list = (trainers ?? Array.Empty<TrainerAssignmentDto>())
            .Where(t => !string.IsNullOrWhiteSpace(t.Name))
            .Select(t => new TrainerAssignmentDto { Name = t.Name.Trim(), Email = string.IsNullOrWhiteSpace(t.Email) ? null : t.Email.Trim() })
            .GroupBy(t => t.Name, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .ToList();
        if (list.Count == 0 && !string.IsNullOrWhiteSpace(fallback)) list.Add(new TrainerAssignmentDto { Name = fallback.Trim() });
        return list;
    }

    private static IReadOnlyList<TrainerAssignmentDto> DeserializeTrainers(string? value, string fallback)
    {
        try
        {
            var items = JsonSerializer.Deserialize<List<TrainerAssignmentDto>>(value ?? string.Empty);
            if (items is { Count: > 0 }) return items;
        }
        catch (JsonException) { }
        return string.IsNullOrWhiteSpace(fallback) ? Array.Empty<TrainerAssignmentDto>() : new[] { new TrainerAssignmentDto { Name = fallback } };
    }
}
