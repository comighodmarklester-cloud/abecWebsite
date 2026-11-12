using ABEC_System.DTOs;
using Microsoft.AspNetCore.Http;

namespace ABEC_System.Interfaces;

public interface IAuthService
{
    Task<ApiResponse<AuthResultDto>> AdminLoginAsync(AdminLoginDto dto, CancellationToken cancellationToken = default);
    Task<ApiResponse<AuthResultDto>> StudentLoginAsync(StudentLoginDto dto, CancellationToken cancellationToken = default);
    Task<ApiResponse<AuthResultDto>> RegisterStudentAsync(StudentRegisterDto dto, CancellationToken cancellationToken = default);
}

public interface IApplicantService
{
    Task ExpireSlotOffersAsync(CancellationToken cancellationToken = default);
    Task<ApiResponse<DashboardStatsDto>> GetDashboardStatsAsync(CancellationToken cancellationToken = default, int? batchId = null);
    Task<ApiResponse<IReadOnlyList<ApplicantDto>>> GetApplicantsAsync(string? status = null, int? courseId = null, string? search = null, int? take = null, CancellationToken cancellationToken = default, int? batchId = null);
    Task<ApiResponse<ApplicantDto>> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<ApiResponse<ApplicantDto>> UpdateRegistrationAsync(int id, UpdateApplicantRegistrationDto dto, CancellationToken cancellationToken = default);
    Task<ApiResponse<ApplicantDto>> EnrollAsync(EnrollApplicantDto dto, CancellationToken cancellationToken = default);
    Task<ApiResponse<ApplicantDto>> EnrollWithDocumentsAsync(
        EnrollApplicantDto dto,
        IReadOnlyList<IFormFile> credentialFiles,
        IFormFile? identityFile,
        CancellationToken cancellationToken = default);
    Task<ApiResponse<IReadOnlyList<ApplicantRegistrationDocumentDto>>> GetRegistrationDocumentsAsync(int applicantId, CancellationToken cancellationToken = default);
    Task<ApiResponse<IReadOnlyList<ApplicantRegistrationDocumentDto>>> GetAllRegistrationDocumentsAsync(CancellationToken cancellationToken = default, int? batchId = null);
    Task<(byte[]? Pdf, string? FileName, string? Error)> GetApplicationFormPdfAsync(int applicantId, CancellationToken cancellationToken = default);
    Task<ApiResponse<ApplicantDto>> UpdateStatusAsync(int id, string status, CancellationToken cancellationToken = default);
    Task<ApiResponse<object>> BulkUpdateStatusAsync(BulkStatusDto dto, CancellationToken cancellationToken = default);
    Task<ApiResponse<ApplicantDto>> ConfirmSlotAsync(string token, CancellationToken cancellationToken = default);
    Task<ApiResponse<ApplicantDto>> DeclineSlotAsync(string token, CancellationToken cancellationToken = default);
    Task<SlotLinkStatusDto> DescribeSlotLinkAsync(string? token, CancellationToken cancellationToken = default);
    Task<ApiResponse<StudentDto>> AddToSlotAsync(int applicantId, CancellationToken cancellationToken = default);
}

public interface IBatchService
{
    Task<ApiResponse<IReadOnlyList<BatchDto>>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<ApiResponse<BatchDto?>> GetActiveAsync(CancellationToken cancellationToken = default);
    Task<ApiResponse<IReadOnlyList<BatchDto>>> GetHistoryAsync(CancellationToken cancellationToken = default);
    Task<ApiResponse<BatchSwitchImpactDto>> GetSwitchImpactAsync(int? targetBatchId = null, CancellationToken cancellationToken = default);
    Task<ApiResponse<IReadOnlyList<StudentDto>>> GetStudentsAsync(int batchId, CancellationToken cancellationToken = default);
    Task<ApiResponse<BatchDto>> CreateAsync(CreateBatchDto dto, CancellationToken cancellationToken = default);
    Task<ApiResponse<BatchDto>> ActivateAsync(int batchId, bool confirmSwitch, CancellationToken cancellationToken = default);
    Task<ApiResponse<BatchDto>> CompleteAsync(int batchId, CancellationToken cancellationToken = default);
}

public interface ICourseService
{
    Task<ApiResponse<CourseDto>> CreateAsync(CreateCourseDto dto, CancellationToken cancellationToken = default);
    Task<ApiResponse<IReadOnlyList<CourseDto>>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<ApiResponse<CourseDto>> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<ApiResponse<IReadOnlyList<StudentDto>>> GetEnrolledStudentsAsync(int courseId, string? search = null, CancellationToken cancellationToken = default, int? batchId = null);
    Task<ApiResponse<CourseDto>> SetSlotCapacityAsync(int courseId, int slotCapacity, CancellationToken cancellationToken = default);
    Task<ApiResponse<CourseHistoryPageDto>> GetHistoryAsync(string? search, int page, int pageSize, CancellationToken cancellationToken = default);
}

public interface IActivationService
{
    Task<ApiResponse<ActivationSummaryDto>> GetSummaryAsync(CancellationToken cancellationToken = default, int? batchId = null);
    Task<ApiResponse<IReadOnlyList<StudentDto>>> GetAccountsAsync(string? status = null, int? courseId = null, string? search = null, CancellationToken cancellationToken = default, int? batchId = null);
    Task<ApiResponse<StudentDto>> GeneratePinAsync(int studentId, CancellationToken cancellationToken = default);
    Task<ApiResponse<StudentDto>> ActivateAsync(int studentId, CancellationToken cancellationToken = default);
    Task<ApiResponse<StudentDto>> DeactivateAsync(int studentId, string archiveReason, string? specificReason = null, CancellationToken cancellationToken = default);
    Task<ApiResponse<StudentDto>> ReactivateAsync(int studentId, CancellationToken cancellationToken = default);
    Task<ApiResponse<object>> BulkUpdateStatusAsync(BulkStatusDto dto, CancellationToken cancellationToken = default);
    Task<ApiResponse<byte[]>> GetActivationNoticePdfAsync(int studentId, CancellationToken cancellationToken = default);
}

public interface IScheduleService
{
    Task<ApiResponse<IReadOnlyList<CourseScheduleDto>>> GetAllAsync(int? courseId = null, int? batchId = null, string? status = null, CancellationToken cancellationToken = default);
    Task<ApiResponse<CourseScheduleDto>> CreateAsync(CreateScheduleDto dto, CancellationToken cancellationToken = default);
    Task<ApiResponse<CourseScheduleDto>> UpdateAsync(int id, UpdateScheduleDto dto, CancellationToken cancellationToken = default);
    Task<ApiResponse<object>> DeleteAsync(int id, CancellationToken cancellationToken = default);
    Task<ApiResponse<bool>> HasConflictAsync(CreateScheduleDto dto, int? excludeScheduleId = null, CancellationToken cancellationToken = default);
}

public interface ITrainingRoomService
{
    Task<ApiResponse<IReadOnlyList<TrainingRoomDto>>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<ApiResponse<TrainingRoomDto>> CreateAsync(CreateTrainingRoomDto dto, CancellationToken cancellationToken = default);
}

public interface IDocumentRequestService
{
    Task<ApiResponse<IReadOnlyList<DocumentRequestDto>>> GetAllAsync(string? status = null, CancellationToken cancellationToken = default, int? batchId = null);
    Task<ApiResponse<DocumentRequestDto>> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<ApiResponse<IReadOnlyList<DocumentRequestDto>>> GetByStudentAsync(int studentId, CancellationToken cancellationToken = default);
    Task<ApiResponse<IReadOnlyList<StudentDocumentCatalogItemDto>>> GetStudentCatalogAsync(int studentId, CancellationToken cancellationToken = default);
    Task<ApiResponse<DocumentRequestDashboardDto>> GetDashboardAsync(CancellationToken cancellationToken = default, int? batchId = null);
    Task<ApiResponse<DocumentRequestDto>> CreateAsync(int studentId, CreateDocumentRequestDto dto, CancellationToken cancellationToken = default);
    Task<ApiResponse<DocumentRequestDto>> UpdateStatusAsync(int id, string status, string? holdReason = null, CancellationToken cancellationToken = default);
    Task<ApiResponse<DocumentRequestDto>> SaveReleaseFileAsync(int id, IFormFile file, CancellationToken cancellationToken = default);
    Task<ApiResponse<DocumentRequestDto>> RemoveReleaseFileAsync(int id, CancellationToken cancellationToken = default);
    Task<(Stream? Stream, string? ContentType, string? FileName, string? Error)> OpenReleaseFileAsync(int id, CancellationToken cancellationToken = default);
    Task<ApiResponse<object>> BulkUpdateStatusAsync(BulkStatusDto dto, CancellationToken cancellationToken = default);
}

public interface INotificationService
{
    Task<ApiResponse<IReadOnlyList<NotificationDto>>> GetForStudentAsync(int studentId, string? status = null, CancellationToken cancellationToken = default);
    Task<ApiResponse<IReadOnlyList<NotificationDto>>> GetAdminNotificationsAsync(int? adminId = null, string? status = null, CancellationToken cancellationToken = default, int? batchId = null);
    Task<ApiResponse<object>> MarkReadAsync(int notificationId, CancellationToken cancellationToken = default);
    Task<ApiResponse<object>> MarkAllReadAsync(int studentId, CancellationToken cancellationToken = default);
    Task CreateAsync(string title, string message, int? studentId = null, int? applicantId = null, CancellationToken cancellationToken = default);
    Task CreateAdminAsync(string title, string message, int? applicantId = null, CancellationToken cancellationToken = default, int? requestId = null, int? courseDocumentId = null);
}

public interface IArchiveService
{
    Task<ApiResponse<IReadOnlyList<ArchiveDto>>> GetAllAsync(string? reason = null, CancellationToken cancellationToken = default, int? batchId = null);
    Task<ApiResponse<ArchiveDto>> CreateAsync(CreateArchiveDto dto, CancellationToken cancellationToken = default);
    Task<ApiResponse<object>> ArchiveStudentFromCourseAsync(int studentId, string reason, string? specificReason = null, CancellationToken cancellationToken = default);
}

public interface IAdminProfileService
{
    Task<ApiResponse<AdminProfileDto>> GetProfileAsync(int adminId, CancellationToken cancellationToken = default);
    Task<ApiResponse<AdminProfileDto>> UpdateProfileAsync(int adminId, UpdateAdminProfileDto dto, string? userAgent = null, string? clientIp = null, CancellationToken cancellationToken = default);
    Task<ApiResponse<object>> ChangePasswordAsync(int adminId, ChangePasswordDto dto, string? userAgent = null, string? clientIp = null, CancellationToken cancellationToken = default);
    Task<ApiResponse<AdminNotificationPrefsDto>> UpdateNotificationPreferencesAsync(int adminId, UpdateAdminNotificationPrefsDto dto, string? userAgent = null, string? clientIp = null, CancellationToken cancellationToken = default);
    Task<ApiResponse<IReadOnlyList<AdminActivityDto>>> GetRecentActivityAsync(int adminId, CancellationToken cancellationToken = default);
}

public interface ICourseDocumentService
{
    Task<ApiResponse<StudentCourseReleaseDto>> PrepareAsync(int studentId, CancellationToken ct = default);
    Task<ApiResponse<CourseReleaseBoardDto>> GetBoardAsync(int courseId, int? batchId, CancellationToken cancellationToken = default);
    Task<ApiResponse<StudentCourseReleaseDto>> GetStudentReleaseAsync(int studentId, CancellationToken cancellationToken = default);
    Task<ApiResponse<StudentCourseDocumentDto>> UploadAsync(int courseDocumentId, IFormFile file, int? adminId, CancellationToken cancellationToken = default);
    Task<ApiResponse<StudentCourseDocumentDto>> ReleaseAsync(int courseDocumentId, int? adminId, CancellationToken cancellationToken = default);
    Task<ApiResponse<CourseReleaseTimelineDto>> SetAssessmentDateAsync(int batchId, DateTime? assessmentDate, CancellationToken cancellationToken = default);
    Task<(Stream? Stream, string? ContentType, string? FileName, string? Error)> OpenFileAsync(int courseDocumentId, int? studentId, int? adminId, CancellationToken cancellationToken = default);
}

public interface IStudentPortalService
{
    Task<ApiResponse<StudentDashboardDto>> GetDashboardAsync(int studentId, CancellationToken cancellationToken = default);
    Task<ApiResponse<StudentDto>> GetProfileAsync(int studentId, CancellationToken cancellationToken = default);
    Task<ApiResponse<StudentDto>> UpdateProfileAsync(int studentId, UpdateStudentProfileDto dto, CancellationToken cancellationToken = default);
    Task<ApiResponse<IReadOnlyList<CourseScheduleDto>>> GetScheduleAsync(int studentId, CancellationToken cancellationToken = default);
    Task<ApiResponse<IReadOnlyList<AdminActivityDto>>> GetLoginActivityAsync(int studentId, CancellationToken cancellationToken = default);
}
