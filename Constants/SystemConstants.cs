namespace ABEC_System.Constants;

public static class SystemConstants
{
    public const int DefaultCourseCapacity = 25;

    public static class ApplicationStatuses
    {
        public const string Pending = "Pending";
        public const string Approved = "Approved";
        public const string Rejected = "Rejected";
        public const string Waitlisted = "Waitlisted";
        public const string Confirmed = "Confirmed Slot";
        public const string ConfirmedLegacy = "Confirmed";
        public const string Declined = "Declined";
        public const string Expired = "Expired";

        public static bool IsConfirmedSlot(string? status) =>
            string.Equals(status, Confirmed, StringComparison.OrdinalIgnoreCase)
            || string.Equals(status, ConfirmedLegacy, StringComparison.OrdinalIgnoreCase);
    }

    public static class SlotResponses
    {
        public const string AwaitingResponse = "AwaitingResponse";
        public const string AwaitingFromWaitlist = "AwaitingFromWaitlist";
        public const string Confirmed = "Confirmed";
        public const string Declined = "Declined";
        public const string Expired = "Expired";
    }

    public static class AccountStatuses
    {
        public const string Active = "Active";
        public const string Inactive = "Inactive";
    }

    public static class ArchiveReasons
    {
        public const string Graduated = "Graduated";
        public const string Deactivated = "Deactivated";
        public const string AcademicDismissal = "Academic Dismissal";
        public const string Withdrawal = "Withdrawal";
        public const string InactiveLead = "Inactive Lead";
        public const string RejectedSlots = "Rejected Slots";
        public const string Other = "Other";

        public static readonly string[] All =
        [
            Graduated,
            Deactivated,
            AcademicDismissal,
            Withdrawal,
            InactiveLead,
            RejectedSlots,
            Other
        ];

        public static string? Normalize(string? reason)
        {
            if (string.IsNullOrWhiteSpace(reason)) return null;
            var trimmed = reason.Trim();
            var match = All.FirstOrDefault(r => string.Equals(r, trimmed, StringComparison.OrdinalIgnoreCase));
            if (match is not null) return match;

            return trimmed.ToLowerInvariant() switch
            {
                "graduate" or "graduation" => Graduated,
                "deactivate" or "deactivation" => Deactivated,
                "dismissal" or "academic dismissal" or "dismissed" => AcademicDismissal,
                "withdraw" or "withdrew" or "dropped" or "drop" => Withdrawal,
                "inactive" or "inactive lead" or "lead" => InactiveLead,
                "others" => Other,
                _ => null
            };
        }

        public static bool IsValid(string? reason) => Normalize(reason) is not null;

        public static bool RequiresSpecificReason(string? reason)
            => string.Equals(Normalize(reason), Other, StringComparison.OrdinalIgnoreCase);

        public static string FormatDisplay(string? reason, string? specificReason)
        {
            var canonical = Normalize(reason) ?? (reason ?? string.Empty).Trim();
            var detail = (specificReason ?? string.Empty).Trim();
            if (string.Equals(canonical, Other, StringComparison.OrdinalIgnoreCase) && detail.Length > 0)
                return $"{Other} — {detail}";
            return canonical;
        }
    }

    public static class ScheduleStatuses
    {
        public const string Active = "Active";
        public const string Inactive = "Inactive";

        public static bool IsActive(string? status) =>
            string.Equals(status, Active, StringComparison.OrdinalIgnoreCase);

        public static string Normalize(string? status) =>
            IsActive(status) ? Active : Inactive;
    }

    public static class BatchStatuses
    {
        public const string Active = "Active";
        public const string Completed = "Completed";
        public const string Closed = Completed; // compatibility for existing callers
        public const string Draft = "Draft";
    }

    public static class CourseStatuses
    {
        public const string Available = "Available";
        public const string Unavailable = "Unavailable";
    }

    public static class DocumentStatuses
    {
        public const string NotRequested = "Not Requested";
        public const string Pending = "Pending";
        public const string Processing = "Processing";
        public const string OnHold = "On Hold";
        public const string ReadyForRelease = "Ready for Release";
        public const string Released = "Released";
        public const string Rejected = "Rejected";

        public static readonly string[] AdminWorkflow =
        [
            Pending,
            Processing,
            OnHold,
            Released,
            Rejected
        ];

        public const string CertificateOfCompletion = "Certificate of Completion";

        public static readonly string[] PostCourseCredentials =
        [
            "National Certificate (TESDA)",
            "Payment Receipt",
            CertificateOfCompletion
        ];

        /// <summary>
        /// Training Certificate is the same ABEC credential as Certificate of Completion.
        /// Existing rows keep their stored text until a later save rewrites it.
        /// </summary>
        public static bool IsTrainingCertificateAlias(string? value)
        {
            var lower = (value ?? string.Empty).Trim().ToLowerInvariant();
            return lower.Contains("training") && lower.Contains("certificate") && !lower.Contains("completion");
        }

        public static string CanonicalCourseDocument(string? value)
        {
            var text = (value ?? string.Empty).Trim();
            if (IsTrainingCertificateAlias(text)) return CertificateOfCompletion;
            return text;
        }

        public static bool SameCourseDocument(string? left, string? right)
            => string.Equals(
                CanonicalCourseDocument(left),
                CanonicalCourseDocument(right),
                StringComparison.OrdinalIgnoreCase);

        /// <summary>Applicant enrollment uploads — not requestable via Document Request.</summary>
        public static readonly string[] ApplicantSubmittedDocuments =
        [
            "Transcript of Records",
            "Honorable Dismissal",
            "Certificate of Good Moral Character",
            "Form 138"
        ];
    }

    /// <summary>Preparation and release state for a course document. Separate from a student request.</summary>
    public static class CourseDocumentStatuses
    {
        public const string NotPrepared = "Not Prepared";
        public const string ReadyForRelease = "Ready for Release";
        public const string Released = "Released";
    }

    public static class NotificationStatuses
    {
        public const string Unread = "Unread";
        public const string Read = "Read";
    }

    public static class AbecOffice
    {
        /// <summary>Official ABEC office address shown in applicant approval emails.</summary>
        public const string Address = "3F PVLB Building, Peñaranda St., Legazpi City, Albay, Philippines";
    }

    public static class TesdaScreeningStatuses
    {
        public const string NoPotentialConflict = "No Potential Conflict";
        public const string ForAdminVerification = "For Admin Verification";
        public const string PotentialEligibilityIssue = "Potential Eligibility Issue";
    }

    public static class ApplicantDocumentCategories
    {
        public const string Credential = "Credential";
        public const string Identity = "Identity";
    }

    public static class RegistrationUploadLimits
    {
        /// <summary>Per-file limit for course documents and document-request uploads.</summary>
        public const long MaxFileBytes = 20 * 1024 * 1024;

        /// <summary>Per-file limit for registration credentials and the identity ID.</summary>
        public const long MaxRegistrationFileBytes = 100L * 1024 * 1024;

        /// <summary>Total registration request: five 100 MB files plus multipart overhead.</summary>
        public const long MaxRegistrationRequestBytes = MaxRegistrationFileBytes * 5 + 20L * 1024 * 1024;

        public static readonly string[] AllowedExtensions = [".pdf", ".jpg", ".jpeg", ".png"];
    }

    public static class RegistrationChoices
    {
        public static readonly string[] QualificationTypes = ["Full Qualification", "COC", "Renewal"];
        public static readonly string[] Classifications =
        [
            "Technical and Vocational Education and Training (TVET) Graduating Student",
            "Technical and Vocational Education and Training (TVET) Graduate",
            "Overseas Filipino Worker (OFW)",
            "Industry Worker",
            "College Graduate",
            "Alternative Learning System (ALS) Graduate",
            "Senior/Junior High School Graduate"
        ];
        public static readonly string[] CivilStatuses = ["Single", "Married", "Widower", "Separated"];
        public static readonly string[] EducationLevels =
        [
            "Elementary Graduate",
            "High School Graduate",
            "TVET Graduate",
            "College Level",
            "College Graduate",
            "Others"
        ];
        public static readonly string[] EmploymentStatuses =
        [
            "Casual",
            "Contractual",
            "Job Order",
            "Probationary",
            "Self-Employed",
            "Overseas Filipino Worker (OFW)"
        ];
        public static readonly (string Code, string Name)[] Regions =
        [
            ("NCR", "National Capital Region (NCR)"),
            ("CAR", "Cordillera Administrative Region (CAR)"),
            ("I", "Ilocos Region (Region I)"),
            ("II", "Cagayan Valley (Region II)"),
            ("III", "Central Luzon (Region III)"),
            ("IV-A", "CALABARZON (Region IV-A)"),
            ("IV-B", "MIMAROPA Region (Region IV-B)"),
            ("V", "Bicol Region (Region V)"),
            ("VI", "Western Visayas (Region VI)"),
            ("VII", "Central Visayas (Region VII)"),
            ("VIII", "Eastern Visayas (Region VIII)"),
            ("IX", "Zamboanga Peninsula (Region IX)"),
            ("X", "Northern Mindanao (Region X)"),
            ("XI", "Davao Region (Region XI)"),
            ("XII", "SOCCSKSARGEN (Region XII)"),
            ("XIII", "Caraga (Region XIII)"),
            ("BARMM", "Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)")
        ];
        public static readonly string[] CredentialDocumentTypes = ["Form138", "TOR", "HonorableDismissal", "GoodMoral"];
    }

    public static class IdentityIdTypes
    {
        public static readonly string[] All =
        [
            "School ID",
            "PhilID / National ID",
            "Driver's License",
            "Passport",
            "UMID",
            "Other Accepted ID"
        ];
    }
}
