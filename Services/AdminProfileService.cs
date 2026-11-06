using ABEC_System.Data;
using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using ABEC_System.Models;
using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Services;

public class AdminProfileService : IAdminProfileService
{
    private readonly ApplicationDbContext _db;
    private readonly INotificationService _notifications;

    public AdminProfileService(ApplicationDbContext db, INotificationService notifications)
    {
        _db = db;
        _notifications = notifications;
    }

    public async Task<ApiResponse<AdminProfileDto>> GetProfileAsync(int adminId, CancellationToken cancellationToken = default)
    {
        var admin = await _db.Admins.AsNoTracking()
            .Include(a => a.UserSetting)
            .FirstOrDefaultAsync(a => a.AdminId == adminId, cancellationToken);
        if (admin is null)
            return ApiResponse<AdminProfileDto>.Fail("Admin not found.");

        return ApiResponse<AdminProfileDto>.Ok(await MapFullAsync(admin, cancellationToken));
    }

    public async Task<ApiResponse<AdminProfileDto>> UpdateProfileAsync(
        int adminId,
        UpdateAdminProfileDto dto,
        string? userAgent = null,
        string? clientIp = null,
        CancellationToken cancellationToken = default)
    {
        var admin = await _db.Admins.Include(a => a.UserSetting)
            .FirstOrDefaultAsync(a => a.AdminId == adminId, cancellationToken);
        if (admin is null)
            return ApiResponse<AdminProfileDto>.Fail("Admin not found.");

        var username = (dto.Username ?? string.Empty).Trim();
        var email = (dto.Email ?? string.Empty).Trim();
        var contact = (dto.ContactNumber ?? string.Empty).Trim();

        if (string.IsNullOrWhiteSpace(username))
            return ApiResponse<AdminProfileDto>.Fail("Username is required.");
        if (username.Length < 3 || username.Length > 50)
            return ApiResponse<AdminProfileDto>.Fail("Username must be 3 to 50 characters.");
        if (!System.Text.RegularExpressions.Regex.IsMatch(username, @"^[A-Za-z0-9._-]+$"))
            return ApiResponse<AdminProfileDto>.Fail("Username may only contain letters, numbers, dots, underscores, and hyphens.");
        if (string.IsNullOrWhiteSpace(email) || !email.Contains('@'))
            return ApiResponse<AdminProfileDto>.Fail("A valid email address is required.");
        if (string.IsNullOrWhiteSpace(contact))
            return ApiResponse<AdminProfileDto>.Fail("Contact number is required.");

        var usernameTaken = await _db.Admins.AnyAsync(
            a => a.AdminId != adminId && a.Username.ToLower() == username.ToLower(),
            cancellationToken);
        if (usernameTaken)
            return ApiResponse<AdminProfileDto>.Fail("That username is already taken. Please choose another.");

        var emailTaken = await _db.Admins.AnyAsync(
            a => a.AdminId != adminId && a.Email != null && a.Email.ToLower() == email.ToLower(),
            cancellationToken);
        if (emailTaken)
            return ApiResponse<AdminProfileDto>.Fail("That email address is already registered to another admin.");

        admin.Username = username;
        admin.Email = email;
        admin.ContactNumber = contact;

        if (admin.UserSetting is null)
        {
            admin.UserSetting = new UserSetting
            {
                AdminId = admin.AdminId,
                Username = username,
                Password = admin.Password,
                EmailNotifications = true,
                InAppAlerts = true,
                SystemAlerts = true,
                StudentUpdates = true,
                DocumentRequests = true
            };
        }
        else
        {
            admin.UserSetting.Username = username;
        }

        await LogActivityAsync(adminId, "Updated personal information", userAgent, clientIp, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);

        return ApiResponse<AdminProfileDto>.Ok(await MapFullAsync(admin, cancellationToken), "Profile updated.");
    }

    public async Task<ApiResponse<object>> ChangePasswordAsync(
        int adminId,
        ChangePasswordDto dto,
        string? userAgent = null,
        string? clientIp = null,
        CancellationToken cancellationToken = default)
    {
        var admin = await _db.Admins.Include(a => a.UserSetting)
            .FirstOrDefaultAsync(a => a.AdminId == adminId, cancellationToken);
        if (admin is null)
            return ApiResponse<object>.Fail("Admin not found.");

        if (!VerifyPassword(dto.CurrentPassword, admin.Password))
            return ApiResponse<object>.Fail("Current password is incorrect.");

        if (string.IsNullOrWhiteSpace(dto.NewPassword) || dto.NewPassword.Length < 6)
            return ApiResponse<object>.Fail("New password must be at least 6 characters.");

        var hashed = AuthService.HashPassword(dto.NewPassword);
        admin.Password = hashed;
        if (admin.UserSetting is not null)
            admin.UserSetting.Password = hashed;

        await LogActivityAsync(adminId, "Changed password", userAgent, clientIp, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
        return ApiResponse<object>.Ok(new { updated = true }, "Password changed successfully.");
    }

    public async Task<ApiResponse<AdminNotificationPrefsDto>> UpdateNotificationPreferencesAsync(
        int adminId,
        UpdateAdminNotificationPrefsDto dto,
        string? userAgent = null,
        string? clientIp = null,
        CancellationToken cancellationToken = default)
    {
        var admin = await _db.Admins.Include(a => a.UserSetting)
            .FirstOrDefaultAsync(a => a.AdminId == adminId, cancellationToken);
        if (admin is null)
            return ApiResponse<AdminNotificationPrefsDto>.Fail("Admin not found.");

        if (admin.UserSetting is null)
        {
            admin.UserSetting = new UserSetting
            {
                AdminId = admin.AdminId,
                Username = admin.Username,
                Password = admin.Password
            };
        }

        admin.UserSetting.EmailNotifications = dto.EmailNotifications;
        admin.UserSetting.InAppAlerts = dto.InAppAlerts;
        admin.UserSetting.SystemAlerts = dto.SystemAlerts;
        admin.UserSetting.StudentUpdates = dto.StudentUpdates;
        admin.UserSetting.DocumentRequests = dto.DocumentRequests;

        await LogActivityAsync(adminId, "Updated notification preferences", userAgent, clientIp, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);

        return ApiResponse<AdminNotificationPrefsDto>.Ok(new AdminNotificationPrefsDto
        {
            EmailNotifications = admin.UserSetting.EmailNotifications,
            InAppAlerts = admin.UserSetting.InAppAlerts,
            SystemAlerts = admin.UserSetting.SystemAlerts,
            StudentUpdates = admin.UserSetting.StudentUpdates,
            DocumentRequests = admin.UserSetting.DocumentRequests
        }, "Notification preferences saved.");
    }

    public async Task<ApiResponse<IReadOnlyList<AdminActivityDto>>> GetRecentActivityAsync(
        int adminId,
        CancellationToken cancellationToken = default)
    {
        var exists = await _db.Admins.AsNoTracking().AnyAsync(a => a.AdminId == adminId, cancellationToken);
        if (!exists)
            return ApiResponse<IReadOnlyList<AdminActivityDto>>.Fail("Admin not found.");

        var list = await _db.AdminActivityLogs.AsNoTracking()
            .Where(a => a.AdminId == adminId)
            .OrderByDescending(a => a.CreatedAt)
            .Take(100)
            .Select(a => new AdminActivityDto
            {
                ActivityId = a.ActivityId,
                Action = a.Action,
                DeviceInfo = a.DeviceInfo ?? "Unknown device",
                IpAddress = a.IpAddress ?? "—",
                Location = a.Location ?? "—",
                CreatedAt = a.CreatedAt
            })
            .ToListAsync(cancellationToken);

        return ApiResponse<IReadOnlyList<AdminActivityDto>>.Ok(list);
    }

    private async Task LogActivityAsync(
        int adminId,
        string action,
        string? userAgent,
        string? clientIp,
        CancellationToken cancellationToken)
    {
        _db.AdminActivityLogs.Add(new AdminActivityLog
        {
            AdminId = adminId,
            Action = action,
            DeviceInfo = SummarizeUserAgent(userAgent),
            IpAddress = string.IsNullOrWhiteSpace(clientIp) ? "—" : clientIp.Trim(),
            Location = "Local network",
            CreatedAt = DateTime.Now
        });
        await Task.CompletedTask;
    }

    private async Task<AdminProfileDto> MapFullAsync(Admin a, CancellationToken cancellationToken)
    {
        var prefs = a.UserSetting is null
            ? new AdminNotificationPrefsDto()
            : new AdminNotificationPrefsDto
            {
                EmailNotifications = a.UserSetting.EmailNotifications,
                InAppAlerts = a.UserSetting.InAppAlerts,
                SystemAlerts = a.UserSetting.SystemAlerts,
                StudentUpdates = a.UserSetting.StudentUpdates,
                DocumentRequests = a.UserSetting.DocumentRequests
            };

        var activity = await _db.AdminActivityLogs.AsNoTracking()
            .Where(x => x.AdminId == a.AdminId)
            .OrderByDescending(x => x.CreatedAt)
            .Take(15)
            .Select(x => new AdminActivityDto
            {
                ActivityId = x.ActivityId,
                Action = x.Action,
                DeviceInfo = x.DeviceInfo ?? "Unknown device",
                IpAddress = x.IpAddress ?? "—",
                Location = x.Location ?? "—",
                CreatedAt = x.CreatedAt
            })
            .ToListAsync(cancellationToken);

        var notifs = await _notifications.GetAdminNotificationsAsync(a.AdminId, null, cancellationToken);

        return new AdminProfileDto
        {
            AdminId = a.AdminId,
            Username = a.Username,
            Email = a.Email ?? string.Empty,
            ContactNumber = a.ContactNumber ?? string.Empty,
            CreatedAt = a.CreatedAt,
            NotificationPreferences = prefs,
            RecentActivity = activity,
            RecentNotifications = notifs.Data ?? Array.Empty<NotificationDto>()
        };
    }

    private static string SummarizeUserAgent(string? userAgent)
    {
        if (string.IsNullOrWhiteSpace(userAgent)) return "Unknown device";
        var ua = userAgent.Trim();
        if (ua.Contains("Edg/", StringComparison.OrdinalIgnoreCase)) return "Microsoft Edge";
        if (ua.Contains("Chrome/", StringComparison.OrdinalIgnoreCase)) return "Google Chrome";
        if (ua.Contains("Firefox/", StringComparison.OrdinalIgnoreCase)) return "Mozilla Firefox";
        if (ua.Contains("Safari/", StringComparison.OrdinalIgnoreCase)) return "Safari";
        return ua.Length > 80 ? ua[..80] + "…" : ua;
    }

    private static bool VerifyPassword(string plain, string stored)
    {
        if (stored.StartsWith("$2", StringComparison.Ordinal))
            return BCrypt.Net.BCrypt.Verify(plain, stored);
        return string.Equals(plain, stored, StringComparison.Ordinal);
    }
}
