using System.ComponentModel.DataAnnotations;

namespace ABEC_System.DTOs;

public class ApiResponse<T>
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public T? Data { get; set; }

    public static ApiResponse<T> Ok(T data, string message = "Success")
        => new() { Success = true, Message = message, Data = data };

    public static ApiResponse<T> Fail(string message)
        => new() { Success = false, Message = message };
}

public class AdminLoginDto
{
    [Required]
    public string Username { get; set; } = string.Empty;

    [Required]
    public string Password { get; set; } = string.Empty;

    public bool RememberDevice { get; set; }

    public string? ClientIp { get; set; }

    public string? UserAgent { get; set; }
}

public class ConfirmSlotDto
{
    [Required]
    public string Token { get; set; } = string.Empty;
}

public class StudentLoginDto
{
    public string? Email { get; set; }

    public string? Username { get; set; }
    public string? Password { get; set; }

    public string SecurityPin { get; set; } = string.Empty;

    public bool RememberDevice { get; set; }

    public string? ClientIp { get; set; }

    public string? UserAgent { get; set; }
}

public class StudentRegisterDto
{
    [Required]
    public string Surname { get; set; } = string.Empty;

    [Required]
    public string FirstName { get; set; } = string.Empty;

    public string? MiddleInitial { get; set; }

    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required, MinLength(6)]
    public string Password { get; set; } = string.Empty;

    [Required]
    public string ConfirmPassword { get; set; } = string.Empty;

    [Required]
    public string SecurityPin { get; set; } = string.Empty;
}

public class AuthResultDto
{
    public int UserId { get; set; }
    public string Role { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string EmailOrUsername { get; set; } = string.Empty;
}

public class EnrollApplicantDto
{
    [Required]
    public string FirstName { get; set; } = string.Empty;

    public string? MiddleName { get; set; }

    [Required]
    public string LastName { get; set; } = string.Empty;

    public string? Suffix { get; set; }

    [Required, EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    public string Province { get; set; } = string.Empty;

    [Required]
    public string CityMunicipality { get; set; } = string.Empty;

    [Required]
    public string Barangay { get; set; } = string.Empty;

    [Required]
    public string StreetDetails { get; set; } = string.Empty;

    /// <summary>Optional pre-combined address. Server builds this when empty.</summary>
    public string? Address { get; set; }

    public int CourseId { get; set; }

    public string? CourseName { get; set; }

    [Required]
    public string ContactNumber { get; set; } = string.Empty;

    public string Gender { get; set; } = string.Empty;

    public DateTime? Birthdate { get; set; }

    /// <summary>Applicant-entered age; must match age calculated from Birthdate and be 18+.</summary>
    public int? Age { get; set; }

    // TESDA initial screening (information gathering — not official TESDA eligibility)
    public bool? TesdaPreviouslyEnrolled { get; set; }
    public string? TesdaPreviousCourse { get; set; }
    public string? TesdaPreviousInstitution { get; set; }
    public string? TesdaPreviousStatus { get; set; }
    public int? TesdaPreviousYear { get; set; }
    public bool? TesdaCurrentlyEnrolled { get; set; }
    public bool? TesdaCompletedQualification { get; set; }
    public string? TesdaCompletedQualificationName { get; set; }
    public string? TesdaScreeningStatus { get; set; }
    public string? TesdaScreeningSummary { get; set; }

    // Identity document submission (admin verification — not automated ID authentication)
    public string? IdentityIdType { get; set; }
    public string? IdentityIdNumber { get; set; }

    public string? SchoolName { get; set; }
    public string? SchoolAddress { get; set; }
    public string? QualificationType { get; set; }
    public string? CocSpecification { get; set; }
    public string? ApplicantClassification { get; set; }
    public string? CivilStatus { get; set; }
    public string? BirthPlace { get; set; }
    public string? Telephone { get; set; }
    public string? Fax { get; set; }
    public string? OtherContact { get; set; }
    public string? EducationLevel { get; set; }
    public string? EducationSpecification { get; set; }
    public string? EmploymentStatus { get; set; }
    public string? AddressDistrict { get; set; }
    public string? AddressRegion { get; set; }
    public string? AddressRegionCode { get; set; }
    public string? ZipCode { get; set; }

    /// <summary>Document labels parallel to credentialFiles (Form138, TOR, HonorableDismissal, GoodMoral).</summary>
    public List<string>? CredentialDocumentTypes { get; set; }

    /// <summary>
    /// Applicant confirmed they read the Data Privacy Notice. This is not consent for every processing activity.
    /// </summary>
    public bool PrivacyNoticeAcknowledged { get; set; }
}

public class UpdateApplicantStatusDto
{
    [Required]
    public string Status { get; set; } = string.Empty;
}

public class BulkStatusDto
{
    [Required]
    public List<int> Ids { get; set; } = new();

    [Required]
    public string Status { get; set; } = string.Empty;
}

public class CreateBatchDto
{
    [Required]
    public string BatchName { get; set; } = string.Empty;

    [Required]
    public DateTime StartDate { get; set; }

    [Required]
    public DateTime EndDate { get; set; }

    /// <summary>When true, activate this batch after create (moves current Active to history).</summary>
    public bool ActivateNow { get; set; }

    /// <summary>Required when ActivateNow is true — admin must acknowledge the switch warning.</summary>
    public bool ConfirmSwitch { get; set; }

    /// <summary>Complete this active batch only when its replacement is saved and activated.</summary>
    public int? CompleteBatchId { get; set; }
}

public class ActivateBatchDto
{
    /// <summary>Admin must acknowledge the serious switch/restore warning.</summary>
    [Required]
    public bool ConfirmSwitch { get; set; }
}

public class CreateTrainingRoomDto
{
    [Required]
    [MaxLength(100)]
    public string RoomName { get; set; } = string.Empty;

    [MaxLength(255)]
    public string? Description { get; set; }

    [Required]
    public int CourseId { get; set; }
}

public class CreateScheduleDto
{
    [Required]
    public int CourseId { get; set; }

    [Required]
    public int BatchId { get; set; }

    [Required]
    public DateTime ScheduleDate { get; set; }

    [Required]
    public TimeSpan StartTime { get; set; }

    [Required]
    public TimeSpan EndTime { get; set; }

    [Required]
    public string Room { get; set; } = string.Empty;

    [Required]
    [MaxLength(50)]
    public string Trainer { get; set; } = string.Empty;

    public IReadOnlyList<TrainerAssignmentDto> Trainers { get; set; } = Array.Empty<TrainerAssignmentDto>();

    public int? ReplaceScheduleId { get; set; }

    [MaxLength(40)]
    public string? TrainingDays { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "Inactive";
}

public class UpdateScheduleDto
{
    public DateTime? ScheduleDate { get; set; }
    public TimeSpan? StartTime { get; set; }
    public TimeSpan? EndTime { get; set; }
    public string? Room { get; set; }
    public string? Trainer { get; set; }
    public IReadOnlyList<TrainerAssignmentDto>? Trainers { get; set; }
    [MaxLength(40)]
    public string? TrainingDays { get; set; }
    public int? BatchId { get; set; }
    public string? Status { get; set; }
}

public class TrainerAssignmentDto
{
    [Required, MaxLength(50)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(150), EmailAddress]
    public string? Email { get; set; }
}

public class CreateDocumentRequestDto
{
    [Required]
    public string DocumentType { get; set; } = string.Empty;

    [Required]
    public string Reason { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? SpecificReason { get; set; }
}

public class UpdateDocumentStatusDto
{
    [Required]
    public string Status { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? HoldReason { get; set; }
}

public class UpdateAdminProfileDto
{
    [Required]
    [MaxLength(50)]
    public string Username { get; set; } = string.Empty;

    [Required, EmailAddress]
    [MaxLength(150)]
    public string Email { get; set; } = string.Empty;

    [Required]
    [MaxLength(30)]
    public string ContactNumber { get; set; } = string.Empty;
}

public class UpdateAdminNotificationPrefsDto
{
    public bool EmailNotifications { get; set; } = true;
    public bool InAppAlerts { get; set; } = true;
    public bool SystemAlerts { get; set; } = true;
    public bool StudentUpdates { get; set; } = true;
    public bool DocumentRequests { get; set; } = true;
}

public class ChangePasswordDto
{
    [Required]
    public string CurrentPassword { get; set; } = string.Empty;

    [Required, MinLength(6)]
    public string NewPassword { get; set; } = string.Empty;
}

public class UpdateSmtpSettingsDto
{
    public bool Enabled { get; set; } = true;

    [MaxLength(150)]
    public string Host { get; set; } = "smtp.gmail.com";

    public int Port { get; set; } = 587;

    [Required]
    [MaxLength(150)]
    public string Username { get; set; } = string.Empty;

    /// <summary>Leave blank to keep the existing App Password.</summary>
    [MaxLength(100)]
    public string? Password { get; set; }

    [MaxLength(100)]
    public string FromName { get; set; } = "ABEC System";

    /// <summary>
    /// Public HTTPS/HTTP base URL used in Confirm/Decline email links.
    /// Must be reachable from applicant devices on any network (production domain or tunnel).
    /// </summary>
    [MaxLength(300)]
    public string? PublicBaseUrl { get; set; }
}

public class SmtpSettingsDto
{
    public bool Enabled { get; set; }
    public string Host { get; set; } = "smtp.gmail.com";
    public int Port { get; set; } = 587;
    public string Username { get; set; } = string.Empty;
    public string FromName { get; set; } = "ABEC System";
    public string FromAddress { get; set; } = string.Empty;
    public bool PasswordConfigured { get; set; }
    public string PasswordHint { get; set; } = string.Empty;
    public string PublicBaseUrl { get; set; } = string.Empty;
    public bool PublicBaseUrlIsReachableRemotely { get; set; }
}

public class UpdateApplicantRegistrationDto
{
    [Required]
    public string FirstName { get; set; } = string.Empty;
    public string? MiddleName { get; set; }
    [Required]
    public string LastName { get; set; } = string.Empty;
    public string? Suffix { get; set; }
    [Required]
    public string Gender { get; set; } = string.Empty;
    [Required]
    public DateTime Birthdate { get; set; }
    public string? CivilStatus { get; set; }
    public string? BirthPlace { get; set; }
    [Required]
    public string Email { get; set; } = string.Empty;
    [Required]
    public string ContactNumber { get; set; } = string.Empty;
    public string? Telephone { get; set; }
    public string? Fax { get; set; }
    public string? OtherContact { get; set; }
    [Required]
    public string StreetDetails { get; set; } = string.Empty;
    [Required]
    public string Barangay { get; set; } = string.Empty;
    [Required]
    public string CityMunicipality { get; set; } = string.Empty;
    [Required]
    public string Province { get; set; } = string.Empty;
    public string? AddressDistrict { get; set; }
    public string? AddressRegion { get; set; }
    public string? ZipCode { get; set; }
    public string? EducationLevel { get; set; }
    public string? EducationSpecification { get; set; }
    public string? SchoolName { get; set; }
    public string? SchoolAddress { get; set; }
    public string? QualificationType { get; set; }
    public string? CocSpecification { get; set; }
    public string? ApplicantClassification { get; set; }
    public string? EmploymentStatus { get; set; }
    public string? IdentityIdType { get; set; }
}

public class UpdateStudentProfileDto
{
    [Required]
    [MaxLength(50)]
    public string FirstName { get; set; } = string.Empty;

    [MaxLength(50)]
    public string? MiddleName { get; set; }

    [Required]
    [MaxLength(50)]
    public string LastName { get; set; } = string.Empty;

    [MaxLength(20)]
    public string? Suffix { get; set; }

    [MaxLength(20)]
    public string? Gender { get; set; }

    public DateTime? Birthdate { get; set; }

    [EmailAddress]
    [MaxLength(100)]
    public string? Email { get; set; }

    [MaxLength(20)]
    public string? ContactNumber { get; set; }

    public string? Address { get; set; }
}

public class CreateArchiveDto
{
    [Required]
    public int StudentId { get; set; }

    [Required]
    public string ArchiveReason { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? SpecificReason { get; set; }
}

public class AddCourseSlotsDto
{
    public int SlotCapacity { get; set; }
}

public class UpdateBatchAssessmentDto
{
    public DateTime? AssessmentDate { get; set; }
}

public class DeactivateAccountDto
{
    [Required]
    public string ArchiveReason { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? SpecificReason { get; set; }
}

public class StudentCredentialUpdateDto
{
    [Required, StringLength(20, MinimumLength = 3), RegularExpression(@"^[A-Za-z0-9._-]+$")]
    public string Username { get; set; } = string.Empty;
    [StringLength(72, MinimumLength = 8)]
    public string? Password { get; set; }
    public string? ConfirmPassword { get; set; }
    public string? CurrentPassword { get; set; }
    public bool PasswordLoginEnabled { get; set; }
}
