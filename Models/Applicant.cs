using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ABEC_System.Models;

[Table("applicants")]
public class Applicant
{
    [Key]
    [Column("applicant_id")]
    public int ApplicantId { get; set; }

    [Required]
    [MaxLength(50)]
    [Column("first_name")]
    public string FirstName { get; set; } = string.Empty;

    [MaxLength(50)]
    [Column("middle_name")]
    public string? MiddleName { get; set; }

    [Required]
    [MaxLength(50)]
    [Column("last_name")]
    public string LastName { get; set; } = string.Empty;

    [MaxLength(20)]
    [Column("suffix")]
    public string? Suffix { get; set; }

    [Required]
    [MaxLength(20)]
    [Column("gender")]
    public string Gender { get; set; } = string.Empty;

    [Column("birthdate")]
    public DateTime Birthdate { get; set; }

    /// <summary>Age at registration, derived from Birthdate (not manually entered).</summary>
    [Column("age")]
    public int Age { get; set; }

    [Required]
    [MaxLength(20)]
    [Column("contact_number")]
    public string ContactNumber { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    [Column("email")]
    public string Email { get; set; } = string.Empty;

    [Required]
    [Column("address")]
    public string Address { get; set; } = string.Empty;

    [MaxLength(100)]
    [Column("province")]
    public string? Province { get; set; }

    [MaxLength(100)]
    [Column("city_municipality")]
    public string? CityMunicipality { get; set; }

    [MaxLength(150)]
    [Column("barangay")]
    public string? Barangay { get; set; }

    [MaxLength(255)]
    [Column("street_details")]
    public string? StreetDetails { get; set; }

    [Column("course_id")]
    public int CourseId { get; set; }

    [Column("batch_id")]
    public int? BatchId { get; set; }

    [Required]
    [MaxLength(30)]
    [Column("application_status")]
    public string ApplicationStatus { get; set; } = "Pending";

    [Column("application_date")]
    public DateTime ApplicationDate { get; set; }

    [MaxLength(64)]
    [Column("confirmation_token")]
    public string? ConfirmationToken { get; set; }

    [Column("confirmed_at")]
    public DateTime? ConfirmedAt { get; set; }

    [Column("declined_at")]
    public DateTime? DeclinedAt { get; set; }

    [Column("response_deadline")]
    public DateTime? ResponseDeadline { get; set; }

    [Column("approval_email_sent_at")]
    public DateTime? ApprovalEmailSentAt { get; set; }

    [MaxLength(30)]
    [Column("slot_response")]
    public string? SlotResponse { get; set; }

    [MaxLength(150)]
    [Column("assigned_training_datetime")]
    public string? AssignedTrainingDateTime { get; set; }

    [MaxLength(40)]
    [Column("tesda_screening_status")]
    public string? TesdaScreeningStatus { get; set; }

    [Column("tesda_screening_summary")]
    public string? TesdaScreeningSummary { get; set; }

    [Column("tesda_previously_enrolled")]
    public bool? TesdaPreviouslyEnrolled { get; set; }

    [MaxLength(150)]
    [Column("tesda_previous_course")]
    public string? TesdaPreviousCourse { get; set; }

    [MaxLength(150)]
    [Column("tesda_previous_institution")]
    public string? TesdaPreviousInstitution { get; set; }

    [MaxLength(30)]
    [Column("tesda_previous_status")]
    public string? TesdaPreviousStatus { get; set; }

    [Column("tesda_previous_year")]
    public int? TesdaPreviousYear { get; set; }

    [Column("tesda_currently_enrolled")]
    public bool? TesdaCurrentlyEnrolled { get; set; }

    [Column("tesda_completed_qualification")]
    public bool? TesdaCompletedQualification { get; set; }

    [MaxLength(150)]
    [Column("tesda_completed_qualification_name")]
    public string? TesdaCompletedQualificationName { get; set; }

    [MaxLength(50)]
    [Column("identity_id_type")]
    public string? IdentityIdType { get; set; }

    [MaxLength(80)]
    [Column("identity_id_number")]
    public string? IdentityIdNumber { get; set; }

    [MaxLength(255)]
    [Column("school_name")]
    public string? SchoolName { get; set; }

    [MaxLength(255)]
    [Column("school_address")]
    public string? SchoolAddress { get; set; }

    [MaxLength(40)]
    [Column("qualification_type")]
    public string? QualificationType { get; set; }

    [MaxLength(200)]
    [Column("coc_specification")]
    public string? CocSpecification { get; set; }

    [MaxLength(160)]
    [Column("applicant_classification")]
    public string? ApplicantClassification { get; set; }

    [MaxLength(30)]
    [Column("civil_status")]
    public string? CivilStatus { get; set; }

    [MaxLength(150)]
    [Column("birth_place")]
    public string? BirthPlace { get; set; }

    [MaxLength(40)]
    [Column("telephone")]
    public string? Telephone { get; set; }

    [MaxLength(40)]
    [Column("fax")]
    public string? Fax { get; set; }

    [MaxLength(150)]
    [Column("other_contact")]
    public string? OtherContact { get; set; }

    [MaxLength(40)]
    [Column("education_level")]
    public string? EducationLevel { get; set; }

    [MaxLength(150)]
    [Column("education_specification")]
    public string? EducationSpecification { get; set; }

    [MaxLength(80)]
    [Column("employment_status")]
    public string? EmploymentStatus { get; set; }

    [MaxLength(100)]
    [Column("address_district")]
    public string? AddressDistrict { get; set; }

    [MaxLength(120)]
    [Column("address_region")]
    public string? AddressRegion { get; set; }

    [MaxLength(12)]
    [Column("address_region_code")]
    public string? AddressRegionCode { get; set; }

    [MaxLength(10)]
    [Column("zip_code")]
    public string? ZipCode { get; set; }

    [MaxLength(40)]
    [Column("application_reference")]
    public string? ApplicationReference { get; set; }

    [MaxLength(40)]
    [Column("email_notification_status")]
    public string? EmailNotificationStatus { get; set; }

    [ForeignKey(nameof(CourseId))]
    public Course? Course { get; set; }

    [ForeignKey(nameof(BatchId))]
    public Batch? Batch { get; set; }

    public Student? Student { get; set; }

    public ICollection<Notification> Notifications { get; set; } = new List<Notification>();
    public ICollection<ApplicantRegistrationDocument> RegistrationDocuments { get; set; } = new List<ApplicantRegistrationDocument>();

    [NotMapped]
    public string FullName
    {
        get
        {
            var parts = new List<string>();
            if (!string.IsNullOrWhiteSpace(FirstName)) parts.Add(FirstName.Trim());
            if (!string.IsNullOrWhiteSpace(MiddleName)) parts.Add(MiddleName.Trim());
            if (!string.IsNullOrWhiteSpace(LastName)) parts.Add(LastName.Trim());
            if (!string.IsNullOrWhiteSpace(Suffix)) parts.Add(Suffix.Trim());
            return string.Join(' ', parts);
        }
    }

    [NotMapped]
    public bool IsSlotConfirmed =>
        string.Equals(ApplicationStatus, "Confirmed Slot", StringComparison.OrdinalIgnoreCase)
        || string.Equals(ApplicationStatus, "Confirmed", StringComparison.OrdinalIgnoreCase)
        || ConfirmedAt.HasValue;

    [NotMapped]
    public bool IsResponseExpired =>
        ApplicationStatus == "Expired"
        || string.Equals(SlotResponse, "Expired", StringComparison.OrdinalIgnoreCase)
        || (ResponseDeadline.HasValue
            && DateTime.Now > ResponseDeadline.Value
            && ApplicationStatus == "Approved"
            && !ConfirmedAt.HasValue
            && !DeclinedAt.HasValue);
}
