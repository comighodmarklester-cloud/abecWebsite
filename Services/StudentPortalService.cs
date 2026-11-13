using ABEC_System.Data;
using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Services;

public class StudentPortalService : IStudentPortalService
{
    private readonly ApplicationDbContext _db;
    private readonly IDocumentRequestService _documents;
    private readonly INotificationService _notifications;

    public StudentPortalService(
        ApplicationDbContext db,
        IDocumentRequestService documents,
        INotificationService notifications)
    {
        _db = db;
        _documents = documents;
        _notifications = notifications;
    }

    public async Task<ApiResponse<StudentDashboardDto>> GetDashboardAsync(int studentId, CancellationToken cancellationToken = default)
    {
        var profile = await GetProfileAsync(studentId, cancellationToken);
        if (!profile.Success || profile.Data is null)
            return ApiResponse<StudentDashboardDto>.Fail(profile.Message);

        var schedule = await GetScheduleAsync(studentId, cancellationToken);
        var docs = await _documents.GetByStudentAsync(studentId, cancellationToken);
        var notifs = await _notifications.GetForStudentAsync(studentId, cancellationToken: cancellationToken);

        var today = DateTime.Today;
        // Active course schedules are the source of truth for the student dashboard.
        var activeSchedules = (schedule.Data ?? Array.Empty<CourseScheduleDto>()).ToList();
        var upcoming = activeSchedules
            .Where(s => s.ScheduleDate.Date >= today)
            .OrderBy(s => s.ScheduleDate)
            .ThenBy(s => s.StartTime)
            .Take(5)
            .ToList();

        // If the only active schedule is in the past, still show it so students see the current assigned schedule.
        if (upcoming.Count == 0 && activeSchedules.Count > 0)
            upcoming = activeSchedules.Take(5).ToList();

        return ApiResponse<StudentDashboardDto>.Ok(new StudentDashboardDto
        {
            Profile = profile.Data,
            UpcomingClasses = upcoming,
            ClassSchedules = activeSchedules,
            RecentDocumentRequests = docs.Data?.Take(5).ToList() ?? new List<DocumentRequestDto>(),
            RecentNotifications = notifs.Data?.Take(5).ToList() ?? new List<NotificationDto>()
        });
    }

    public async Task<ApiResponse<StudentDto>> GetProfileAsync(int studentId, CancellationToken cancellationToken = default)
    {
        var student = await _db.Students.AsNoTracking()
            .Include(s => s.Applicant)!.ThenInclude(a => a!.Course)
            .Include(s => s.Batch)
            .FirstOrDefaultAsync(s => s.StudentId == studentId, cancellationToken);

        if (student is null)
            return ApiResponse<StudentDto>.Fail("Student not found.");

        return ApiResponse<StudentDto>.Ok(new StudentDto
        {
            StudentId = student.StudentId,
            ApplicantId = student.ApplicantId,
            FullName = student.Applicant?.FullName ?? string.Empty,
            Email = student.Applicant?.Email ?? string.Empty,
            ContactNumber = student.Applicant?.ContactNumber ?? string.Empty,
            Address = AddressFormatting.FullAddress(student.Applicant),
            CourseName = student.Applicant?.Course?.CourseName ?? string.Empty,
            CourseId = student.Applicant?.CourseId ?? 0,
            FirstName = student.Applicant?.FirstName ?? string.Empty,
            MiddleName = student.Applicant?.MiddleName,
            LastName = student.Applicant?.LastName ?? string.Empty,
            Suffix = student.Applicant?.Suffix,
            Gender = student.Applicant?.Gender,
            Birthdate = student.Applicant?.Birthdate,
            SchoolName = student.Applicant?.SchoolName,
            SchoolAddress = student.Applicant?.SchoolAddress,
            CivilStatus = student.Applicant?.CivilStatus,
            CourseDuration = CourseProgram.FromCourse(student.Applicant?.Course)?.Summary
                ?? student.Applicant?.Course?.Duration
                ?? string.Empty,
            ProgramSummary = CourseProgram.FromCourse(student.Applicant?.Course)?.Summary
                ?? student.Applicant?.Course?.Duration
                ?? string.Empty,
            BatchId = student.BatchId,
            BatchName = student.Batch?.BatchName ?? string.Empty,
            BatchStatus = student.Batch?.Status ?? string.Empty,
            BatchCompletedAt = student.Batch?.CompletedAt,
            CanViewTrainingSchedule = student.Batch?.Status == "Active",
            BatchStartDate = student.Batch?.StartDate,
            BatchEndDate = student.Batch?.EndDate,
            AccountStatus = student.AccountStatus,
            ApplicationStatus = student.Applicant?.ApplicationStatus ?? string.Empty,
            CreatedAt = student.CreatedAt
        });
    }

    public async Task<ApiResponse<StudentDto>> UpdateProfileAsync(int studentId, UpdateStudentProfileDto dto, CancellationToken cancellationToken = default)
    {
        var student = await _db.Students
            .Include(s => s.Applicant)!.ThenInclude(a => a!.Course)
            .Include(s => s.Batch)
            .FirstOrDefaultAsync(s => s.StudentId == studentId, cancellationToken);

        if (student?.Applicant is null)
            return ApiResponse<StudentDto>.Fail("Student not found.");

        if (dto.Birthdate.HasValue && dto.Birthdate.Value.Date > DateTime.Today)
            return ApiResponse<StudentDto>.Fail("Birthdate cannot be in the future.");

        student.Applicant.FirstName = dto.FirstName.Trim();
        student.Applicant.MiddleName = string.IsNullOrWhiteSpace(dto.MiddleName) ? null : dto.MiddleName.Trim();
        student.Applicant.LastName = dto.LastName.Trim();
        student.Applicant.Suffix = string.IsNullOrWhiteSpace(dto.Suffix) ? null : dto.Suffix.Trim();
        if (!string.IsNullOrWhiteSpace(dto.Gender)) student.Applicant.Gender = dto.Gender.Trim();
        if (dto.Birthdate.HasValue) student.Applicant.Birthdate = dto.Birthdate.Value.Date;
        if (!string.IsNullOrWhiteSpace(dto.Email)) student.Applicant.Email = dto.Email.Trim();
        if (!string.IsNullOrWhiteSpace(dto.ContactNumber)) student.Applicant.ContactNumber = dto.ContactNumber.Trim();
        if (!string.IsNullOrWhiteSpace(dto.Address)) student.Applicant.Address = dto.Address.Trim();

        await _db.SaveChangesAsync(cancellationToken);
        return await GetProfileAsync(studentId, cancellationToken);
    }

    public async Task<ApiResponse<IReadOnlyList<CourseScheduleDto>>> GetScheduleAsync(int studentId, CancellationToken cancellationToken = default)
    {
        var student = await _db.Students.AsNoTracking()
            .Include(s => s.Applicant).Include(s => s.Batch)
            .FirstOrDefaultAsync(s => s.StudentId == studentId, cancellationToken);

        if (student?.Applicant is null)
            return ApiResponse<IReadOnlyList<CourseScheduleDto>>.Fail("Student not found.");

        if (student.Batch?.Status != "Active") return ApiResponse<IReadOnlyList<CourseScheduleDto>>.Ok(Array.Empty<CourseScheduleDto>());

        // Read the student's actual enrollment, never the currently selected admin batch.
        var active = await _db.CourseSchedules.AsNoTracking()
            .Include(s => s.Course)
            .Include(s => s.Batch)
            .Where(s => s.BatchId == student.BatchId && s.CourseId == student.Applicant.CourseId
                        && s.Status == Constants.SystemConstants.ScheduleStatuses.Active)
            .OrderBy(s => s.ScheduleDate)
            .ThenBy(s => s.StartTime)
            .ToListAsync(cancellationToken);

        // Keep the admin and student payloads in sync, including saved training days,
        // batch dates and legacy trainer assignments.
        var mapped = active.Select(ScheduleService.Map).ToList();

        return ApiResponse<IReadOnlyList<CourseScheduleDto>>.Ok(mapped);
    }

    public async Task<ApiResponse<IReadOnlyList<AdminActivityDto>>> GetLoginActivityAsync(int studentId, CancellationToken cancellationToken = default)
    {
        var exists = await _db.Students.AsNoTracking().AnyAsync(s => s.StudentId == studentId, cancellationToken);
        if (!exists)
            return ApiResponse<IReadOnlyList<AdminActivityDto>>.Fail("Student not found.");

        var rows = await _db.StudentActivityLogs.AsNoTracking()
            .Where(a => a.StudentId == studentId)
            .OrderByDescending(a => a.CreatedAt)
            .ThenByDescending(a => a.ActivityId)
            .Take(100)
            .Select(a => new AdminActivityDto
            {
                ActivityId = a.ActivityId,
                Action = a.Action,
                DeviceInfo = a.DeviceInfo ?? "Unknown device",
                IpAddress = a.IpAddress ?? "—",
                Location = string.Empty,
                CreatedAt = a.CreatedAt
            })
            .ToListAsync(cancellationToken);

        return ApiResponse<IReadOnlyList<AdminActivityDto>>.Ok(rows);
    }
}
