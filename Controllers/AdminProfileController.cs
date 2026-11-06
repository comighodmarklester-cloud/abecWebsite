using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace ABEC_System.Controllers;

[ApiController]
[Route("api/admin")]
public class AdminProfileController : ControllerBase
{
    private readonly IAdminProfileService _profileService;
    private readonly IApplicantService _applicantService;

    public AdminProfileController(IAdminProfileService profileService, IApplicantService applicantService)
    {
        _profileService = profileService;
        _applicantService = applicantService;
    }

    [HttpGet("dashboard/stats")]
    public async Task<ActionResult<ApiResponse<DashboardStatsDto>>> DashboardStats(CancellationToken cancellationToken)
        => Ok(await _applicantService.GetDashboardStatsAsync(cancellationToken));

    [HttpGet("profile/{adminId:int}")]
    public async Task<ActionResult<ApiResponse<AdminProfileDto>>> GetProfile(int adminId, CancellationToken cancellationToken)
        => Ok(await _profileService.GetProfileAsync(adminId, cancellationToken));

    [HttpPut("profile/{adminId:int}")]
    public async Task<ActionResult<ApiResponse<AdminProfileDto>>> UpdateProfile(
        int adminId,
        [FromBody] UpdateAdminProfileDto dto,
        CancellationToken cancellationToken)
        => Ok(await _profileService.UpdateProfileAsync(
            adminId,
            dto,
            Request.Headers.UserAgent.ToString(),
            HttpContext.Connection.RemoteIpAddress?.ToString(),
            cancellationToken));

    [HttpPost("profile/{adminId:int}/change-password")]
    public async Task<ActionResult<ApiResponse<object>>> ChangePassword(
        int adminId,
        [FromBody] ChangePasswordDto dto,
        CancellationToken cancellationToken)
        => Ok(await _profileService.ChangePasswordAsync(
            adminId,
            dto,
            Request.Headers.UserAgent.ToString(),
            HttpContext.Connection.RemoteIpAddress?.ToString(),
            cancellationToken));

    [HttpPut("profile/{adminId:int}/notification-preferences")]
    public async Task<ActionResult<ApiResponse<AdminNotificationPrefsDto>>> UpdateNotificationPreferences(
        int adminId,
        [FromBody] UpdateAdminNotificationPrefsDto dto,
        CancellationToken cancellationToken)
        => Ok(await _profileService.UpdateNotificationPreferencesAsync(
            adminId,
            dto,
            Request.Headers.UserAgent.ToString(),
            HttpContext.Connection.RemoteIpAddress?.ToString(),
            cancellationToken));

    [HttpGet("profile/{adminId:int}/activity")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<AdminActivityDto>>>> GetActivity(
        int adminId,
        CancellationToken cancellationToken)
        => Ok(await _profileService.GetRecentActivityAsync(adminId, cancellationToken));

    [HttpGet("email-settings")]
    public ActionResult<ApiResponse<SmtpSettingsDto>> GetEmailSettings([FromServices] IEmailConfigService emailConfig)
        => Ok(ApiResponse<SmtpSettingsDto>.Ok(emailConfig.GetSettings()));

    [HttpPut("email-settings")]
    public async Task<ActionResult<ApiResponse<SmtpSettingsDto>>> SaveEmailSettings(
        [FromBody] UpdateSmtpSettingsDto dto,
        [FromServices] IEmailConfigService emailConfig,
        CancellationToken cancellationToken)
        => Ok(await emailConfig.SaveSettingsAsync(dto, cancellationToken));
}
