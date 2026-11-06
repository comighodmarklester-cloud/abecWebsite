using ABEC_System.Constants;
using ABEC_System.Data;
using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using ABEC_System.Models;
using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Services;

public class NotificationService : INotificationService
{
    private readonly ApplicationDbContext _db;

    private static readonly string[] StudentUpdateTitles =
    [
        "New Applicant Registration",
        "Applicant Confirmed Slot",
        "Applicant Declined Slot",
        "Applicant Slot Response Expired",
        "Waitlisted Applicant Available"
    ];

    private static readonly string[] DocumentRequestTitles =
    [
        "New Document Request"
    ];

    public NotificationService(ApplicationDbContext db) => _db = db;

    public async Task<ApiResponse<IReadOnlyList<NotificationDto>>> GetForStudentAsync(int studentId, string? status = null, CancellationToken cancellationToken = default)
    {
        var query = _db.Notifications.AsNoTracking().Where(n => n.StudentId == studentId);
        if (!string.IsNullOrWhiteSpace(status))
            query = query.Where(n => n.Status == status);

        var list = await query.OrderByDescending(n => n.CreatedAt).ToListAsync(cancellationToken);
        return ApiResponse<IReadOnlyList<NotificationDto>>.Ok(list.Select(Map).ToList());
    }

    public async Task<ApiResponse<IReadOnlyList<NotificationDto>>> GetAdminNotificationsAsync(
        int? adminId = null,
        string? status = null,
        CancellationToken cancellationToken = default,
        int? batchId = null)
    {
        // Admin-targeted events only (applicant-only notices also have null student_id).
        string[] adminTitles =
        [
            "New Applicant Registration",
            "Applicant Confirmed Slot",
            "Applicant Declined Slot",
            "Applicant Slot Response Expired",
            "Waitlisted Applicant Available",
            "New Document Request"
        ];

        var query = _db.Notifications.AsNoTracking().Include(n => n.Applicant).Include(n => n.Student)
            .Where(n => n.StudentId == null && adminTitles.Contains(n.Title));

        if (!string.IsNullOrWhiteSpace(status))
            query = query.Where(n => n.Status == status);

        if (batchId.HasValue) query = query.Where(n => n.Applicant != null && n.Applicant.BatchId == batchId && DocumentRequestTitles.Contains(n.Title));
        var ordered = query.OrderByDescending(n => n.CreatedAt);
        var list = await (batchId.HasValue ? ordered.AsQueryable() : ordered.Take(50)).ToListAsync(cancellationToken);

        if (adminId.HasValue)
        {
            var prefs = await _db.UserSettings.AsNoTracking()
                .FirstOrDefaultAsync(s => s.AdminId == adminId.Value, cancellationToken);

            if (prefs is not null)
            {
                if (!prefs.InAppAlerts)
                    return ApiResponse<IReadOnlyList<NotificationDto>>.Ok(Array.Empty<NotificationDto>());

                list = list.Where(n => IsAllowedByPrefs(n.Title, prefs)).ToList();
            }
        }

        return ApiResponse<IReadOnlyList<NotificationDto>>.Ok(list.Select(Map).ToList());
    }

    public async Task<ApiResponse<object>> MarkReadAsync(int notificationId, CancellationToken cancellationToken = default)
    {
        var entity = await _db.Notifications.FirstOrDefaultAsync(n => n.NotificationId == notificationId, cancellationToken);
        if (entity is null)
            return ApiResponse<object>.Fail("Notification not found.");

        entity.Status = SystemConstants.NotificationStatuses.Read;
        await _db.SaveChangesAsync(cancellationToken);
        return ApiResponse<object>.Ok(new { updated = true }, "Notification marked as read.");
    }

    public async Task<ApiResponse<object>> MarkAllReadAsync(int studentId, CancellationToken cancellationToken = default)
    {
        var items = await _db.Notifications
            .Where(n => n.StudentId == studentId && n.Status == SystemConstants.NotificationStatuses.Unread)
            .ToListAsync(cancellationToken);

        foreach (var item in items)
            item.Status = SystemConstants.NotificationStatuses.Read;

        await _db.SaveChangesAsync(cancellationToken);
        return ApiResponse<object>.Ok(new { updated = items.Count }, "All notifications marked as read.");
    }

    public async Task CreateAsync(string title, string message, int? studentId = null, int? applicantId = null, CancellationToken cancellationToken = default)
    {
        _db.Notifications.Add(new Notification
        {
            StudentId = studentId,
            ApplicantId = applicantId,
            Title = title,
            Message = message,
            Status = SystemConstants.NotificationStatuses.Unread,
            CreatedAt = DateTime.Now
        });
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task CreateAdminAsync(string title, string message, int? applicantId = null, CancellationToken cancellationToken = default, int? requestId = null)
    {
        _db.Notifications.Add(new Notification
        {
            RequestId = requestId,
            StudentId = null,
            ApplicantId = applicantId,
            Title = title,
            Message = message,
            Status = SystemConstants.NotificationStatuses.Unread,
            CreatedAt = DateTime.Now
        });
        await _db.SaveChangesAsync(cancellationToken);
    }

    private static bool IsAllowedByPrefs(string title, UserSetting prefs)
    {
        if (StudentUpdateTitles.Contains(title, StringComparer.OrdinalIgnoreCase))
            return prefs.StudentUpdates;
        if (DocumentRequestTitles.Contains(title, StringComparer.OrdinalIgnoreCase))
            return prefs.DocumentRequests;
        return prefs.SystemAlerts;
    }

    private static NotificationDto Map(Notification n) => new()
    {
        RequestId = n.RequestId,
        BatchId = n.Applicant?.BatchId ?? n.Student?.BatchId,
        NotificationId = n.NotificationId,
        StudentId = n.StudentId,
        ApplicantId = n.ApplicantId,
        Title = n.Title,
        Message = n.Message,
        Status = n.Status,
        CreatedAt = n.CreatedAt
    };
}
