using Microsoft.AspNetCore.RateLimiting;
using System.Security.Claims;
using System.Text;
using ABEC_System.Data;
using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using ABEC_System.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ABEC_System.Controllers;

[ApiController]
[Authorize(AuthenticationSchemes = "StudentSession", Roles = "Student")]
[Route("api/student/account")]
public class StudentAccountController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly IStudentPortalService _portal;
    public StudentAccountController(ApplicationDbContext db, IStudentPortalService portal) { _db = db; _portal = portal; }
    private int StudentId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var student = await _db.Students.AsNoTracking().Include(s => s.Applicant)
            .FirstOrDefaultAsync(s => s.StudentId == StudentId && s.AccountStatus == "Active", ct);
        if (student?.Applicant is null) return Unauthorized();
        var profile = await _portal.GetProfileAsync(StudentId, ct);
        var login = await _db.StudentLoginCredentials.AsNoTracking().FirstOrDefaultAsync(c => c.StudentId == StudentId, ct);
        var a = student.Applicant;
        var registration = new Dictionary<string, string?> {
            ["Application reference"] = a.ApplicationReference,
            ["Registration date"] = a.ApplicationDate.ToString("MMM d, yyyy"),
            ["Civil status"] = a.CivilStatus, ["Birthplace"] = a.BirthPlace,
            ["School or company"] = a.SchoolName, ["School or company address"] = a.SchoolAddress,
            ["Qualification type"] = a.QualificationType, ["COC specification"] = a.CocSpecification,
            ["Applicant classification"] = a.ApplicantClassification,
            ["Education level"] = a.EducationLevel, ["Education specification"] = a.EducationSpecification,
            ["Employment status"] = a.EmploymentStatus, ["Telephone"] = a.Telephone,
            ["Fax"] = a.Fax, ["Other contact"] = a.OtherContact,
            ["Province"] = a.Province, ["City or municipality"] = a.CityMunicipality,
            ["Barangay"] = a.Barangay, ["Street details"] = a.StreetDetails,
            ["District"] = a.AddressDistrict, ["Region"] = a.AddressRegion, ["ZIP code"] = a.ZipCode,
            ["Identity document type"] = a.IdentityIdType, ["Identity document number"] = a.IdentityIdNumber,
            ["Previously enrolled in TESDA"] = a.TesdaPreviouslyEnrolled?.ToString(),
            ["Previous course"] = a.TesdaPreviousCourse, ["Previous institution"] = a.TesdaPreviousInstitution,
            ["Previous course status"] = a.TesdaPreviousStatus, ["Previous enrollment year"] = a.TesdaPreviousYear?.ToString(),
            ["Currently enrolled in TESDA"] = a.TesdaCurrentlyEnrolled?.ToString(),
            ["Completed qualification"] = a.TesdaCompletedQualification?.ToString(),
            ["Completed qualification name"] = a.TesdaCompletedQualificationName
        };
        return Ok(ApiResponse<object>.Ok(new { profile = profile.Data, registration,
            login = new { hasPassword = login is not null, username = login?.Username, passwordLoginEnabled = login?.PasswordLoginEnabled ?? false } }));
    }

    [HttpPut("profile")]
    public async Task<IActionResult> SaveProfile(UpdateStudentProfileDto dto, CancellationToken ct)
    {
        if (!await _db.Students.AnyAsync(s => s.StudentId == StudentId && s.AccountStatus == "Active", ct)) return Unauthorized();
        return Ok(await _portal.UpdateProfileAsync(StudentId, dto, ct));
    }

    [EnableRateLimiting("StudentLogin")]
    [HttpPut("credentials")]
    public async Task<IActionResult> SaveCredentials(StudentCredentialUpdateDto dto, CancellationToken ct)
    {
        var student = await _db.Students.AnyAsync(s => s.StudentId == StudentId && s.AccountStatus == "Active", ct);
        if (!student) return Unauthorized();
        var credentials = await _db.StudentLoginCredentials.FirstOrDefaultAsync(c => c.StudentId == StudentId, ct);
        if (credentials is not null && (string.IsNullOrEmpty(dto.CurrentPassword) ||
            Encoding.UTF8.GetByteCount(dto.CurrentPassword) > 72 || !BCrypt.Net.BCrypt.Verify(dto.CurrentPassword, credentials.PasswordHash)))
            return Ok(ApiResponse<object>.Fail("Enter your current password to update login settings."));
        if (credentials is null && string.IsNullOrEmpty(dto.Password))
            return Ok(ApiResponse<object>.Fail("Enter a password before saving login settings."));
        if (!string.IsNullOrEmpty(dto.Password) &&
            (dto.Password.Length < 8 || Encoding.UTF8.GetByteCount(dto.Password) > 72 || dto.Password != dto.ConfirmPassword))
            return Ok(ApiResponse<object>.Fail("Use at least 8 characters (up to 72 UTF-8 bytes) and matching passwords."));
        var username = dto.Username.Trim().ToLowerInvariant();
        if (await _db.StudentLoginCredentials.AnyAsync(c => c.Username == username && c.StudentId != StudentId, ct))
            return Ok(ApiResponse<object>.Fail("That username is already in use. Choose another."));
        if (credentials is null) {
            credentials = new StudentLoginCredential { StudentId = StudentId };
            _db.StudentLoginCredentials.Add(credentials);
        }
        credentials.Username = username;
        if (!string.IsNullOrEmpty(dto.Password)) credentials.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password);
        credentials.PasswordLoginEnabled = dto.PasswordLoginEnabled;
        try { await _db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (ex.InnerException is MySqlConnector.MySqlException { Number: 1062 }) {
            return Ok(ApiResponse<object>.Fail("Login settings changed or the username is in use. Reload and try again."));
        }
        return Ok(ApiResponse<object>.Ok(new { hasPassword = true, username, passwordLoginEnabled = credentials.PasswordLoginEnabled }, "Login settings saved."));
    }
}
