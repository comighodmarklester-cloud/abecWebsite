using ABEC_System.Constants;
using ABEC_System.Data;
using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using ABEC_System.Models;
using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Services;

public class AuthService : IAuthService
{
    private readonly ApplicationDbContext _db;

    public AuthService(ApplicationDbContext db)
    {
        _db = db;
    }

    public async Task<ApiResponse<AuthResultDto>> AdminLoginAsync(AdminLoginDto dto, CancellationToken cancellationToken = default)
    {
        var username = (dto.Username ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(username) && string.IsNullOrWhiteSpace(dto.Password))
            return ApiResponse<AuthResultDto>.Fail("Please enter your username and password.");
        if (string.IsNullOrWhiteSpace(username))
            return ApiResponse<AuthResultDto>.Fail("Please enter your username.");
        if (string.IsNullOrWhiteSpace(dto.Password))
            return ApiResponse<AuthResultDto>.Fail("Please enter your password.");
        if (System.Text.Encoding.UTF8.GetByteCount(dto.Password) > 72)
            return ApiResponse<AuthResultDto>.Fail("Incorrect username or password. Please try again.");
        if (username.Length < 3 || username.Length > 50 ||
            !System.Text.RegularExpressions.Regex.IsMatch(username, @"^[A-Za-z0-9._-]+$"))
            return ApiResponse<AuthResultDto>.Fail("Please enter a valid username.");

        var admin = await _db.Admins
            .FirstOrDefaultAsync(a => a.Username.ToLower() == username.ToLower(), cancellationToken);

        if (admin is null || !VerifyPassword(dto.Password, admin.Password))
            return ApiResponse<AuthResultDto>.Fail("Incorrect username or password. Please try again.");
        if (!admin.Password.StartsWith("$2", StringComparison.Ordinal))
        {
            admin.Password = HashPassword(dto.Password);
            var legacySetting = await _db.UserSettings.FirstOrDefaultAsync(s => s.AdminId == admin.AdminId, cancellationToken);
            if (legacySetting is not null) legacySetting.Password = admin.Password;
        }

        await LogActivityAsync(
            admin.AdminId,
            "Logged in",
            dto.UserAgent,
            dto.ClientIp,
            cancellationToken);

        return ApiResponse<AuthResultDto>.Ok(new AuthResultDto
        {
            UserId = admin.AdminId,
            Role = "Admin",
            DisplayName = admin.Username,
            EmailOrUsername = admin.Username
        }, "Admin login successful.");
    }

    public async Task<ApiResponse<AuthResultDto>> StudentLoginAsync(StudentLoginDto dto, CancellationToken cancellationToken = default)
    {
        Student? student;
        if (!string.IsNullOrEmpty(dto.Username) || !string.IsNullOrEmpty(dto.Password))
        {
            var username = (dto.Username ?? string.Empty).Trim().ToLowerInvariant();
            if (username.Length < 3 || username.Length > 20 || string.IsNullOrEmpty(dto.Password) ||
                System.Text.Encoding.UTF8.GetByteCount(dto.Password) > 72)
                return ApiResponse<AuthResultDto>.Fail("Incorrect username or password.");
            var credentials = await _db.StudentLoginCredentials.AsNoTracking()
                .FirstOrDefaultAsync(c => c.Username == username, cancellationToken);
            if (credentials is null || !credentials.PasswordLoginEnabled ||
                !BCrypt.Net.BCrypt.Verify(dto.Password, credentials.PasswordHash))
                return ApiResponse<AuthResultDto>.Fail("Incorrect username or password.");
            student = await _db.Students.AsNoTracking().Include(s => s.Applicant)
                .FirstOrDefaultAsync(s => s.StudentId == credentials.StudentId, cancellationToken);
        }
        else
        {
            var email = dto.Email?.Trim() ?? "";
            if (email.Length is < 3 or > 100 || !new System.ComponentModel.DataAnnotations.EmailAddressAttribute().IsValid(email))
                return ApiResponse<AuthResultDto>.Fail("Enter your registered email address and security PIN.");
            var pin = (dto.SecurityPin ?? string.Empty).Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(pin)) return ApiResponse<AuthResultDto>.Fail("Enter your security PIN.");
            if (pin.Length > 20 || pin.Any(c => !char.IsLetterOrDigit(c) && c != '-'))
                return ApiResponse<AuthResultDto>.Fail("Invalid login details.");
            student = await FindStudentByPinAsync(pin, cancellationToken);
            if (student?.Applicant is not null && !string.IsNullOrWhiteSpace(dto.Email)
                && !string.Equals(student.Applicant.Email, dto.Email.Trim(), StringComparison.OrdinalIgnoreCase))
                return ApiResponse<AuthResultDto>.Fail("Invalid login details.");
            if (student is not null && await _db.StudentLoginCredentials.AnyAsync(
                c => c.StudentId == student.StudentId && c.PasswordLoginEnabled, cancellationToken))
                return ApiResponse<AuthResultDto>.Fail("Username and password login is enabled. Use your username and password.");
        }
        if (student?.Applicant is null)
            return ApiResponse<AuthResultDto>.Fail("Invalid login details.");

        if (student.AccountStatus != SystemConstants.AccountStatuses.Active)
            return ApiResponse<AuthResultDto>.Fail("Student account is not active. Please contact the registrar.");

        _db.StudentActivityLogs.Add(new StudentActivityLog
        {
            StudentId = student.StudentId,
            Action = "Logged in",
            DeviceInfo = SummarizeUserAgent(dto.UserAgent),
            IpAddress = string.IsNullOrWhiteSpace(dto.ClientIp) ? "—" : dto.ClientIp.Trim(),
            CreatedAt = DateTime.Now
        });
        await _db.SaveChangesAsync(cancellationToken);

        return ApiResponse<AuthResultDto>.Ok(new AuthResultDto
        {
            UserId = student.StudentId,
            Role = "Student",
            DisplayName = student.Applicant.FullName,
            EmailOrUsername = student.Applicant.Email
        }, "Student login successful.");
    }

    public async Task<ApiResponse<AuthResultDto>> RegisterStudentAsync(StudentRegisterDto dto, CancellationToken cancellationToken = default)
    {
        // Legacy registration may sign in an existing active account. Only admins activate accounts.
        if (dto.Password != dto.ConfirmPassword)
            return ApiResponse<AuthResultDto>.Fail("Password and confirm password do not match.");

        var pin = (dto.SecurityPin ?? string.Empty).Trim().ToUpperInvariant();
        if (pin.Length is < 1 or > 20 || pin.Any(c => !char.IsLetterOrDigit(c) && c != '-'))
            return ApiResponse<AuthResultDto>.Fail("Invalid login details.");
        var student = await FindStudentByPinAsync(pin, cancellationToken);

        if (student?.Applicant is null)
            return ApiResponse<AuthResultDto>.Fail("No student account matches this security PIN. Contact the registrar.");
        if (student.AccountStatus != SystemConstants.AccountStatuses.Active)
            return ApiResponse<AuthResultDto>.Fail("Student account is not active. Please contact the registrar.");

        if (!string.IsNullOrWhiteSpace(dto.Email) &&
            !string.Equals(student.Applicant.Email, dto.Email.Trim(), StringComparison.OrdinalIgnoreCase))
            return ApiResponse<AuthResultDto>.Fail("Email does not match the student record for this PIN.");

        if (await _db.StudentLoginCredentials.AnyAsync(c => c.StudentId == student.StudentId && c.PasswordLoginEnabled, cancellationToken))
            return ApiResponse<AuthResultDto>.Fail("This account uses username and password login. Sign in with your configured credentials.");

        return ApiResponse<AuthResultDto>.Ok(new AuthResultDto
        {
            UserId = student.StudentId,
            Role = "Student",
            DisplayName = student.Applicant.FullName,
            EmailOrUsername = student.Applicant.Email
        }, "Student sign-in successful.");
    }

    private async Task<Student?> FindStudentByPinAsync(string pin, CancellationToken ct)
    {
        var student = await _db.Students.AsNoTracking().Include(s => s.Applicant)
            .FirstOrDefaultAsync(s => s.SecurityPin == pin, ct);
        // Older printed notices inserted a hyphen after ABEC. Prefer an exact
        // issued code, then accept that display-only alias without changing it.
        if (student is null && pin.StartsWith("ABEC-", StringComparison.Ordinal))
        {
            var issued = "ABEC" + pin[5..];
            student = await _db.Students.AsNoTracking().Include(s => s.Applicant)
                .FirstOrDefaultAsync(s => s.SecurityPin == issued, ct);
        }
        return student;
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
        await _db.SaveChangesAsync(cancellationToken);
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
        if (string.IsNullOrWhiteSpace(stored) || string.IsNullOrEmpty(plain)
            || System.Text.Encoding.UTF8.GetByteCount(plain) > 72) return false;
        if (stored.StartsWith("$2", StringComparison.Ordinal))
        {
            try { return BCrypt.Net.BCrypt.Verify(plain, stored); }
            catch (BCrypt.Net.SaltParseException) { return false; }
        }
        return System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(
            System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(plain)),
            System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(stored)));
    }

    public static string HashPassword(string plain) => BCrypt.Net.BCrypt.HashPassword(plain);

    public static bool PasswordMatches(string plain, string stored) => VerifyPassword(plain, stored);
}
