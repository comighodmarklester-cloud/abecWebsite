using ABEC_System.Constants;
using ABEC_System.Data;
using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using ABEC_System.Models;
using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Services;

public class CourseService : ICourseService
{
    private readonly ApplicationDbContext _db;
    private readonly CourseHistoryRecorder _history;

    public CourseService(ApplicationDbContext db, CourseHistoryRecorder history)
    {
        _db = db;
        _history = history;
    }

    public async Task<ApiResponse<IReadOnlyList<CourseDto>>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        var courses = await _db.Courses.AsNoTracking().OrderBy(c => c.CourseName).ToListAsync(cancellationToken);
        var result = new List<CourseDto>();
        foreach (var course in courses)
            result.Add(await MapAsync(course, cancellationToken));
        return ApiResponse<IReadOnlyList<CourseDto>>.Ok(result);
    }

    public async Task<ApiResponse<CourseDto>> CreateAsync(CreateCourseDto dto, CancellationToken cancellationToken = default)
    {
        var name = System.Text.RegularExpressions.Regex.Replace(dto.CourseName?.Trim() ?? "", @"\s+", " ");
        if (name.Length == 0 || name.Length > 150 || dto.TrainingDays is < 1 or > 365
            || dto.OjtDays is < 0 or > 365 || dto.HoursPerDay is < 1 or > 12
            || dto.SlotCapacity is < 1 or > 500 || dto.CourseDescription?.Length > 4000)
            return ApiResponse<CourseDto>.Fail("Enter a course name, valid training duration, and 1 to 500 slots.");

        // Serialize creation across instances so simultaneous duplicate names cannot be saved.
        await using var creationLock = await SlotWorkflowLock.AcquireAsync(_db, "course-catalog", cancellationToken);
        var names = await _db.Courses.Select(c => c.CourseName).ToListAsync(cancellationToken);
        string Key(string value) => System.Text.RegularExpressions.Regex.Replace(value, @"\s*NC\s*II\b", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase).Trim();
        if (names.Any(existing => Key(existing).Equals(Key(name), StringComparison.OrdinalIgnoreCase)))
            return ApiResponse<CourseDto>.Fail("A course with this name already exists.");

        await using var transaction = await _db.Database.BeginTransactionAsync(cancellationToken);
        var course = new Course { CourseName = name, CourseDescription = dto.CourseDescription?.Trim(),
            TrainingDays = dto.TrainingDays, OjtDays = dto.OjtDays, HoursPerDay = dto.HoursPerDay,
            TotalHours = (dto.TrainingDays + dto.OjtDays) * dto.HoursPerDay,
            Duration = $"{dto.TrainingDays} training days" + (dto.OjtDays > 0 ? $" + {dto.OjtDays} OJT days" : ""),
            SlotCapacity = dto.SlotCapacity, Status = SystemConstants.CourseStatuses.Available };
        _db.Courses.Add(course);
        await _db.SaveChangesAsync(cancellationToken);
        await _history.AddAsync(course.CourseId, course.CourseName, "Course created", null, course.Duration, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return ApiResponse<CourseDto>.Ok(await MapAsync(course, cancellationToken), "Course saved successfully.");
    }

    public async Task<ApiResponse<CourseDto>> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        var course = await _db.Courses.AsNoTracking().FirstOrDefaultAsync(c => c.CourseId == id, cancellationToken);
        if (course is null)
            return ApiResponse<CourseDto>.Fail("Course not found.");

        return ApiResponse<CourseDto>.Ok(await MapAsync(course, cancellationToken));
    }

    public async Task<ApiResponse<CourseDto>> SetSlotCapacityAsync(int courseId, int slotCapacity, CancellationToken cancellationToken = default)
    {
        if (slotCapacity < 1 || slotCapacity > 500)
            return ApiResponse<CourseDto>.Fail("Enter a whole number of slots from 1 to 500.");

        var course = await _db.Courses.FirstOrDefaultAsync(c => c.CourseId == courseId, cancellationToken);
        if (course is null)
            return ApiResponse<CourseDto>.Fail("Course not found.");

        var filled = await _db.Students.AsNoTracking()
            .CountAsync(s => s.Applicant != null && s.Applicant.CourseId == course.CourseId && s.Batch != null && s.Batch.Status == "Active", cancellationToken);
        if (slotCapacity < filled)
            return ApiResponse<CourseDto>.Fail($"This course already has {filled} enrolled {(filled == 1 ? "student" : "students")}. Slot capacity cannot be lower than the occupied slots.");

        var current = course.SlotCapacity > 0 ? course.SlotCapacity : SystemConstants.DefaultCourseCapacity;
        if (slotCapacity != current)
        {
            await _history.AddAsync(
                course.CourseId,
                course.CourseName,
                "Slot capacity updated",
                $"{current} slots",
                $"{slotCapacity} slots",
                cancellationToken);
            course.SlotCapacity = slotCapacity;
            await _db.SaveChangesAsync(cancellationToken);
        }

        var mapped = await MapAsync(course, cancellationToken);
        return ApiResponse<CourseDto>.Ok(mapped, $"{course.CourseName} now has {slotCapacity} total slots and {mapped.RemainingSlots} available.");
    }

    public async Task<ApiResponse<IReadOnlyList<StudentDto>>> GetEnrolledStudentsAsync(int courseId, string? search = null, CancellationToken cancellationToken = default, int? batchId = null)
    {
        batchId = await _db.ResolveReadBatchIdAsync(batchId, cancellationToken);
        // Students created after Confirm Slot are enrolled into the course (via Applicant.CourseId).
        var query = _db.Students.AsNoTracking()
            .Include(s => s.Applicant)!.ThenInclude(a => a!.Course)
            .Include(s => s.Batch)
            .Where(s => s.BatchId == batchId && s.Applicant != null && s.Applicant.CourseId == courseId);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(s =>
                s.Applicant!.FirstName.ToLower().Contains(term) ||
                s.Applicant.LastName.ToLower().Contains(term) ||
                (s.Applicant.FirstName + " " + s.Applicant.LastName).ToLower().Contains(term) ||
                (s.Applicant.FirstName + " " + (s.Applicant.MiddleName ?? "") + " " + s.Applicant.LastName).ToLower().Contains(term) ||
                s.Applicant.Email.ToLower().Contains(term) ||
                (s.Applicant.ContactNumber != null && s.Applicant.ContactNumber.ToLower().Contains(term)));
        }

        var students = await query
            .OrderByDescending(s => s.Applicant!.ConfirmedAt ?? s.CreatedAt)
            .ThenBy(s => s.Applicant!.LastName)
            .ToListAsync(cancellationToken);

        var studentIds = students.Select(s => s.StudentId).ToList();
        var archivedIds = (await _db.Archives.AsNoTracking().Where(a => studentIds.Contains(a.StudentId))
            .Select(a => a.StudentId).Distinct().ToListAsync(cancellationToken)).ToHashSet();
        return ApiResponse<IReadOnlyList<StudentDto>>.Ok(students.Select(s =>
        {
            var dto = MapStudent(s);
            dto.IsArchived = archivedIds.Contains(s.StudentId);
            return dto;
        }).ToList());
    }

    public async Task<ApiResponse<CourseHistoryPageDto>> GetHistoryAsync(string? search, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 ? 12 : Math.Min(pageSize, 50);

        var query = _db.CourseManagementHistories.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(h => h.CourseName.ToLower().Contains(term)
                || h.Action.ToLower().Contains(term)
                || (h.PreviousValue != null && h.PreviousValue.ToLower().Contains(term))
                || (h.NewValue != null && h.NewValue.ToLower().Contains(term))
                || (h.ModifiedBy != null && h.ModifiedBy.ToLower().Contains(term)));
        }

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderByDescending(h => h.CreatedAt)
            .ThenByDescending(h => h.HistoryId)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(h => new CourseManagementHistoryDto
            {
                HistoryId = h.HistoryId,
                CourseId = h.CourseId,
                CourseName = h.CourseName,
                Action = h.Action,
                PreviousValue = h.PreviousValue,
                NewValue = h.NewValue,
                CreatedAt = h.CreatedAt,
                ModifiedBy = h.ModifiedBy
            })
            .ToListAsync(cancellationToken);

        return ApiResponse<CourseHistoryPageDto>.Ok(new CourseHistoryPageDto
        {
            Items = items,
            TotalCount = total,
            Page = page,
            PageSize = pageSize
        });
    }

    private async Task<CourseDto> MapAsync(Course course, CancellationToken cancellationToken)
    {
        // Occupied slots = students enrolled for this course (created when applicant confirms slot).
        // Available slots = saved course capacity minus those occupied seats.
        var filled = await _db.Students.AsNoTracking()
            .Include(s => s.Applicant)
            .CountAsync(s => s.Applicant != null && s.Applicant.CourseId == course.CourseId && s.Batch != null && s.Batch.Status == "Active", cancellationToken);

        var capacity = course.SlotCapacity > 0 ? course.SlotCapacity : SystemConstants.DefaultCourseCapacity;
        var courseStatus = filled >= capacity
            ? SystemConstants.CourseStatuses.Unavailable
            : (string.IsNullOrWhiteSpace(course.Status) ? SystemConstants.CourseStatuses.Available : course.Status);

        return new CourseDto
        {
            CourseId = course.CourseId,
            CourseName = course.CourseName,
            CourseDescription = course.CourseDescription,
            Duration = course.Duration,
            HoursPerDay = course.HoursPerDay,
            TotalHours = course.TotalHours,
            TrainingDays = course.TrainingDays,
            OjtDays = course.OjtDays,
            ProgramSummary = CourseProgram.FromCourse(course)?.Summary ?? course.Duration,
            Status = courseStatus,
            Capacity = capacity,
            FilledSlots = filled
        };
    }

    private static StudentDto MapStudent(Models.Student s) => new()
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
        AccountStatus = s.AccountStatus,
        ApplicationStatus = s.Applicant?.ApplicationStatus ?? string.Empty,
        ConfirmationStatus = SystemConstants.ApplicationStatuses.IsConfirmedSlot(s.Applicant?.ApplicationStatus)
            || s.Applicant?.ConfirmedAt != null
            ? SystemConstants.ApplicationStatuses.Confirmed
            : (s.Applicant?.ApplicationStatus ?? "—"),
        ApplicationDate = s.Applicant?.ApplicationDate,
        ConfirmedAt = s.Applicant?.ConfirmedAt,
        CreatedAt = s.CreatedAt
    };
}
