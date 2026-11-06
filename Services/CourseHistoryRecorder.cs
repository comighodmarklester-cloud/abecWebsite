using ABEC_System.Data;
using ABEC_System.Models;
using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Services;

public class CourseHistoryRecorder
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;

    public CourseHistoryRecorder(ApplicationDbContext db, IHttpContextAccessor http)
    {
        _db = db;
        _http = http;
    }

    public async Task AddAsync(
        int courseId,
        string courseName,
        string action,
        string? previousValue,
        string? newValue,
        CancellationToken cancellationToken)
    {
        var (adminId, modifiedBy) = await ResolveAdminAsync(cancellationToken);
        _db.CourseManagementHistories.Add(new CourseManagementHistory
        {
            CourseId = courseId,
            CourseName = string.IsNullOrWhiteSpace(courseName) ? "Course" : courseName.Trim(),
            Action = action.Trim(),
            PreviousValue = Limit(previousValue),
            NewValue = Limit(newValue),
            AdminId = adminId,
            ModifiedBy = modifiedBy,
            CreatedAt = DateTime.Now
        });
    }

    private static string? Limit(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var text = value.Trim();
        return text.Length <= 500 ? text : text[..500];
    }

    private async Task<(int? Id, string? Name)> ResolveAdminAsync(CancellationToken cancellationToken)
    {
        var raw = _http.HttpContext?.Request.Headers["X-Abec-Admin-Id"].FirstOrDefault();
        if (!int.TryParse(raw, out var adminId) || adminId <= 0)
            return (null, null);

        var admin = await _db.Admins.AsNoTracking()
            .FirstOrDefaultAsync(a => a.AdminId == adminId, cancellationToken);
        return admin is null ? (null, null) : (admin.AdminId, admin.Username);
    }
}
