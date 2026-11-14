using ABEC_System.Constants;

namespace ABEC_System.DTOs;

public sealed record SecurityPinDto(int StudentId, string SecurityPin);

public class DashboardStatsDto
{
    public int TotalApplicants { get; set; }
    public int Pending { get; set; }
    public int Waitlisted { get; set; }
    public int Approved { get; set; }
    public int Rejected { get; set; }
    public int ActiveStudents { get; set; }
    public int EnrolledStudents { get; set; }
    public int AwaitingActivation { get; set; }
    public int AvailableCourses { get; set; }
    public int PendingDocuments { get; set; }
    public int ReleasedDocuments { get; set; }
    public int ReadyToReleaseDocuments { get; set; }
    public int UpcomingSchedules { get; set; }
}

public class ApplicantDto
{
    public int ApplicantId { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string? MiddleName { get; set; }
    public string LastName { get; set; } = string.Empty;
    public string? Suffix { get; set; }
    public string Email { get; set; } = string.Empty;
    public string ContactNumber { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string? Province { get; set; }
    public string? CityMunicipality { get; set; }
    public string? Barangay { get; set; }
    public string? StreetDetails { get; set; }
    public string Gender { get; set; } = string.Empty;
    public DateTime Birthdate { get; set; }
    public int Age { get; set; }
    public int CourseId { get; set; }
    public string CourseName { get; set; } = string.Empty;
    public int? BatchId { get; set; }
    public string? BatchName { get; set; }
    public string ApplicationStatus { get; set; } = string.Empty;
    public DateTime ApplicationDate { get; set; }
    public bool HasStudentAccount { get; set; }
    public bool IsSlotConfirmed { get; set; }
    public DateTime? ConfirmedAt { get; set; }
    public DateTime? DeclinedAt { get; set; }
    public DateTime? ResponseDeadline { get; set; }
    public DateTime? ApprovalEmailSentAt { get; set; }
    public bool CanRetryApprovalEmail { get; set; }
    public string? SlotResponse { get; set; }
    public string? AssignedTrainingDateTime { get; set; }
    public bool IsResponseExpired { get; set; }
    public string? TesdaScreeningStatus { get; set; }
    public string? TesdaScreeningSummary { get; set; }
    public bool? TesdaPreviouslyEnrolled { get; set; }
    public string? TesdaPreviousCourse { get; set; }
    public string? TesdaPreviousInstitution { get; set; }
    public string? TesdaPreviousStatus { get; set; }
    public int? TesdaPreviousYear { get; set; }
    public bool? TesdaCurrentlyEnrolled { get; set; }
    public bool? TesdaCompletedQualification { get; set; }
    public string? TesdaCompletedQualificationName { get; set; }
    public string? IdentityIdType { get; set; }
    public bool HasRegistrationDocuments { get; set; }
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
    public string? ZipCode { get; set; }
    public string? ApplicationReference { get; set; }
    public string? EmailNotificationStatus { get; set; }
}

public class ApplicantRegistrationDocumentDto
{
    public bool IsFollowUp { get; set; }
    public int DocumentId { get; set; }
    public int ApplicantId { get; set; }
    public string Category { get; set; } = string.Empty;
    public string? DocumentLabel { get; set; }
    public string OriginalFileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public DateTime UploadedAt { get; set; }
}

public class BatchDto
{
    public DateTime? CompletedAt { get; set; }
    public int UnreadDocumentNotifications { get; set; }
    public int BatchId { get; set; }
    public string BatchName { get; set; } = string.Empty;
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public string Status { get; set; } = string.Empty;
    public int StudentCount { get; set; }
    public int ActiveStudentCount { get; set; }
    public int ActiveScheduleCount { get; set; }
    public string AcademicYear => $"{StartDate:yyyy}–{EndDate:yyyy}";
}

public class BatchSwitchImpactDto
{
    public BatchDto? CurrentActiveBatch { get; set; }
    public BatchDto? TargetBatch { get; set; }
    public int ActiveEnrolledStudents { get; set; }
    public int PendingApplicants { get; set; }
    public int WaitlistedApplicants { get; set; }
    public int AwaitingConfirmation { get; set; }
    public int PendingActivations { get; set; }
    public int ActiveCourseSchedules { get; set; }
    public int PendingDocumentRequests { get; set; }
    public int TotalOpenItems =>
        ActiveEnrolledStudents + PendingApplicants + WaitlistedApplicants +
        AwaitingConfirmation + PendingActivations + ActiveCourseSchedules + PendingDocumentRequests;
    public bool HasOpenItems => TotalOpenItems > 0;
    public string Instruction { get; set; } =
        "Changing the active batch will start a new semester/training period. Records belonging to the previous batch will be preserved in Batch History and will not be deleted. The new batch will become the active batch for new applicants, students, schedules, and related records.";
}

public class CourseDto
{
    public int CourseId { get; set; }
    public string CourseName { get; set; } = string.Empty;
    public string? CourseDescription { get; set; }
    public string Duration { get; set; } = string.Empty;
    public int HoursPerDay { get; set; }
    public int TotalHours { get; set; }
    public int TrainingDays { get; set; }
    public int OjtDays { get; set; }
    public string ProgramSummary { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public int Capacity { get; set; }
    public int FilledSlots { get; set; }
    public int RemainingSlots => Math.Max(0, Capacity - FilledSlots);
}

public class CourseManagementHistoryDto
{
    public int HistoryId { get; set; }
    public int CourseId { get; set; }
    public string CourseName { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string? PreviousValue { get; set; }
    public string? NewValue { get; set; }
    public DateTime CreatedAt { get; set; }
    public string? ModifiedBy { get; set; }
}

public class CourseHistoryPageDto
{
    public IReadOnlyList<CourseManagementHistoryDto> Items { get; set; } = Array.Empty<CourseManagementHistoryDto>();
    public int TotalCount { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
}

public class StudentDto
{
    public string BatchStatus { get; set; } = string.Empty;
    public DateTime? BatchCompletedAt { get; set; }
    public bool CanViewTrainingSchedule { get; set; }
    public int StudentId { get; set; }
    public int ApplicantId { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string ContactNumber { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string CourseName { get; set; } = string.Empty;
    public int CourseId { get; set; }
    public string CourseDuration { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string? MiddleName { get; set; }
    public string LastName { get; set; } = string.Empty;
    public string? Suffix { get; set; }
    public string? Gender { get; set; }
    public DateTime? Birthdate { get; set; }
    public string? SchoolName { get; set; }
    public string? SchoolAddress { get; set; }
    public string? CivilStatus { get; set; }
    public string ProgramSummary { get; set; } = string.Empty;
    public int BatchId { get; set; }
    public string BatchName { get; set; } = string.Empty;
    public DateTime? BatchStartDate { get; set; }
    public DateTime? BatchEndDate { get; set; }
    [System.Text.Json.Serialization.JsonIgnore]
    public string SecurityPin { get; set; } = string.Empty;
    public bool HasSecurityPin => !string.IsNullOrEmpty(SecurityPin);
    public int SecurityPinVersion { get; set; }
    public bool HasCurrentSecurityPinFormat { get; set; }
    public DateTime? SecurityPinGeneratedAt { get; set; }
    public string AccountStatus { get; set; } = string.Empty;
    public string ApplicationStatus { get; set; } = string.Empty;
    public string ConfirmationStatus { get; set; } = string.Empty;
    public DateTime? ApplicationDate { get; set; }
    public DateTime? ConfirmedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public bool IsArchived { get; set; }
}

public class ActivationSummaryDto
{
    public int TotalApprovedStudents { get; set; }
    public int PendingActivation { get; set; }
    public int ActivatedAccounts { get; set; }
    public int DeactivatedAccounts { get; set; }
}

public class TrainingRoomDto
{
    public int RoomId { get; set; }
    public string RoomName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int? CourseId { get; set; }
    public string CourseName { get; set; } = string.Empty;
}

public class CourseScheduleDto
{
    public int ScheduleId { get; set; }
    public int CourseId { get; set; }
    public string CourseName { get; set; } = string.Empty;
    public int BatchId { get; set; }
    public string BatchName { get; set; } = string.Empty;
    public DateTime? BatchStartDate { get; set; }
    public DateTime? BatchEndDate { get; set; }
    public DateTime ScheduleDate { get; set; }
    public TimeSpan StartTime { get; set; }
    public TimeSpan EndTime { get; set; }
    public string Room { get; set; } = string.Empty;
    public string Trainer { get; set; } = string.Empty;
    public IReadOnlyList<TrainerAssignmentDto> Trainers { get; set; } = Array.Empty<TrainerAssignmentDto>();
    public string? TrainingDays { get; set; }
    public string Status { get; set; } = "Inactive";
    public string DayOfWeek => ScheduleDate.DayOfWeek.ToString();
}

public class DocumentRequestDto
{
    public int RequestId { get; set; }
    public int StudentId { get; set; }
    public string StudentName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string ContactNumber { get; set; } = string.Empty;
    public string CourseName { get; set; } = string.Empty;
    public string DocumentType { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public string? SpecificReason { get; set; }
    public string RequestStatus { get; set; } = string.Empty;
    public string? HoldReason { get; set; }
    public DateTime RequestDate { get; set; }
    public DateTime? ReleaseDate { get; set; }
    public bool HasFile { get; set; }
    public string? ReleaseFileName { get; set; }
    public long? ReleaseFileSize { get; set; }
    public DateTime? ReleaseUploadedAt { get; set; }
}

public class StudentDocumentCatalogItemDto
{
    public string? DownloadUrl { get; set; }
    public string? RequestBlockedMessage { get; set; }
    public string DocumentType { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Status { get; set; } = SystemConstants.DocumentStatuses.NotRequested;
    public int? RequestId { get; set; }
    public string? Reason { get; set; }
    public string? SpecificReason { get; set; }
    public string? HoldReason { get; set; }
    public DateTime? RequestDate { get; set; }
    public DateTime? ReleaseDate { get; set; }
    public bool CanRequest { get; set; } = true;
}

public class AbecDocumentReleaseSummaryDto
{
    public string DocumentType { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int ReleasedCount { get; set; }
    public int NotReleasedCount { get; set; }
    public string ReleaseStatus { get; set; } = "Not Released";
}

public class DocumentRequestDashboardDto
{
    public IReadOnlyList<AbecDocumentReleaseSummaryDto> AbecDocuments { get; set; } = Array.Empty<AbecDocumentReleaseSummaryDto>();
    public int Pending { get; set; }
    public int Processing { get; set; }
    public int OnHold { get; set; }
    public int ReadyForRelease { get; set; }
    public int Released { get; set; }
}

public class NotificationDto
{
    public int? CourseDocumentId { get; set; }
    public int? RequestId { get; set; }
    public int? BatchId { get; set; }
    public int NotificationId { get; set; }
    public int? StudentId { get; set; }
    public int? ApplicantId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public class ArchiveDto
{
    public int ArchiveId { get; set; }
    public int StudentId { get; set; }
    public string StudentName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string ContactNumber { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string CourseName { get; set; } = string.Empty;
    public string BatchName { get; set; } = string.Empty;
    public string AccountStatus { get; set; } = string.Empty;
    public string ApplicationStatus { get; set; } = string.Empty;
    public string ConfirmationStatus { get; set; } = string.Empty;
    public string ArchiveReason { get; set; } = string.Empty;
    public string? SpecificReason { get; set; }
    public DateTime ArchiveDate { get; set; }
    public DateTime? CreatedAt { get; set; }
}

public class AdminActivityDto
{
    public int ActivityId { get; set; }
    public string Action { get; set; } = string.Empty;
    public string DeviceInfo { get; set; } = string.Empty;
    public string IpAddress { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public class AdminNotificationPrefsDto
{
    public bool EmailNotifications { get; set; } = true;
    public bool InAppAlerts { get; set; } = true;
    public bool SystemAlerts { get; set; } = true;
    public bool StudentUpdates { get; set; } = true;
    public bool DocumentRequests { get; set; } = true;
}

public class AdminProfileDto
{
    public int AdminId { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string ContactNumber { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public AdminNotificationPrefsDto NotificationPreferences { get; set; } = new();
    public IReadOnlyList<AdminActivityDto> RecentActivity { get; set; } = Array.Empty<AdminActivityDto>();
    public IReadOnlyList<NotificationDto> RecentNotifications { get; set; } = Array.Empty<NotificationDto>();
}

public class CourseReleaseTimelineDto
{
    public int? CourseId { get; set; }
    public string CourseName { get; set; } = string.Empty;
    public int? BatchId { get; set; }
    public string BatchName { get; set; } = string.Empty;
    public string? TrainingStartDisplay { get; set; }
    public string? DurationDisplay { get; set; }
    public string? CompletionDisplay { get; set; }
    public string? AssessmentDisplay { get; set; }
    public string? ReleaseDeadlineDisplay { get; set; }
    public DateTime? TrainingStart { get; set; }
    public DateTime? CompletionDate { get; set; }
    public DateTime? AssessmentDate { get; set; }
    public DateTime? ReleaseDeadline { get; set; }
    public int? DurationDays { get; set; }
    public string ExpectedReleaseLabel { get; set; } = string.Empty;
    public string StudentReleaseMessage { get; set; } = string.Empty;
    public bool ScheduleComplete { get; set; }
    public string? ProgramSummary { get; set; }
    public bool RequestsOpen { get; set; }
    public string? RequestBlockedMessage { get; set; }
    public string? TrainingCompletionDisplay { get; set; }
}

public class CourseReleaseBatchOptionDto
{
    public int BatchId { get; set; }
    public string BatchName { get; set; } = string.Empty;
    public int StudentCount { get; set; }
}

public class CourseReleaseBoardDto
{
    public CourseReleaseTimelineDto Timeline { get; set; } = new();
    public IReadOnlyList<CourseReleaseBatchOptionDto> Batches { get; set; } = Array.Empty<CourseReleaseBatchOptionDto>();
    public int EnrolledStudents { get; set; }
    public int StudentsRequiringPreparation { get; set; }
    public int StudentsFullyReleased { get; set; }
    public int StudentsPending { get; set; }
    public int OutstandingRequests { get; set; }
    public int OverdueDocuments { get; set; }
    public int ApproachingDocuments { get; set; }
}

public class StudentCourseDocumentDto
{
    public int CourseDocumentId { get; set; }
    public int StudentId { get; set; }
    public int CourseId { get; set; }
    public int? BatchId { get; set; }
    public string DocumentType { get; set; } = string.Empty;
    public string PreparationStatus { get; set; } = string.Empty;
    public string? FileName { get; set; }
    public bool HasFile { get; set; }
    public DateTime? UploadedAt { get; set; }
    public DateTime? ReleasedAt { get; set; }
    public bool IsOverdue { get; set; }
    public bool IsApproaching { get; set; }
    public string? ReleaseDeadlineDisplay { get; set; }
}

public class StudentCourseReleaseDto
{
    public IReadOnlyList<StudentDocumentCatalogItemDto> Catalog { get; set; } = Array.Empty<StudentDocumentCatalogItemDto>();
    public CourseReleaseTimelineDto Timeline { get; set; } = new();
    public IReadOnlyList<StudentCourseDocumentDto> Documents { get; set; } = Array.Empty<StudentCourseDocumentDto>();
}

public class StudentDashboardDto
{
    public StudentDto Profile { get; set; } = new();
    public IReadOnlyList<CourseScheduleDto> UpcomingClasses { get; set; } = Array.Empty<CourseScheduleDto>();
    public IReadOnlyList<CourseScheduleDto> ClassSchedules { get; set; } = Array.Empty<CourseScheduleDto>();
    public IReadOnlyList<DocumentRequestDto> RecentDocumentRequests { get; set; } = Array.Empty<DocumentRequestDto>();
    public IReadOnlyList<NotificationDto> RecentNotifications { get; set; } = Array.Empty<NotificationDto>();
}
