using System.Text.Json;
using ABEC_System.Constants;
using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using ABEC_System.Services;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;

namespace ABEC_System.Controllers;

[ApiController]
[Route("api/applicants")]
public class ApplicantController : ControllerBase
{
    private static readonly JsonSerializerOptions EnrollJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly IApplicantService _applicantService;
    private readonly ApplicantRegistrationStorageService _registrationStorage;

    public ApplicantController(
        IApplicantService applicantService,
        ApplicantRegistrationStorageService registrationStorage)
    {
        _applicantService = applicantService;
        _registrationStorage = registrationStorage;
    }

    [HttpGet("stats")]
    public async Task<ActionResult<ApiResponse<DashboardStatsDto>>> Stats(CancellationToken cancellationToken)
        => Ok(await _applicantService.GetDashboardStatsAsync(cancellationToken));

    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ApplicantDto>>>> GetAll(
        [FromQuery] string? status,
        [FromQuery] int? courseId,
        [FromQuery] string? search,
        [FromQuery] int? take,
        CancellationToken cancellationToken)
        => Ok(await _applicantService.GetApplicantsAsync(status, courseId, search, take, cancellationToken));

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ApiResponse<ApplicantDto>>> GetById(int id, CancellationToken cancellationToken)
        => Ok(await _applicantService.GetByIdAsync(id, cancellationToken));

    /// <summary>JSON-only enrollment (legacy / no file uploads).</summary>
    [HttpPost("enroll")]
    [Consumes("application/json")]
    public async Task<ActionResult<ApiResponse<ApplicantDto>>> Enroll(CancellationToken cancellationToken)
    {
        EnrollApplicantDto? bodyDto;
        try
        {
            bodyDto = await Request.ReadFromJsonAsync<EnrollApplicantDto>(EnrollJsonOptions, cancellationToken);
        }
        catch
        {
            return Ok(ApiResponse<ApplicantDto>.Fail("Invalid registration data."));
        }

        if (bodyDto is null)
            return Ok(ApiResponse<ApplicantDto>.Fail("Invalid registration data."));

        return Ok(await _applicantService.EnrollAsync(bodyDto, cancellationToken));
    }

    /// <summary>Registration wizard with optional credential and identity file uploads.</summary>
    [HttpPost("enroll/files")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(SystemConstants.RegistrationUploadLimits.MaxRegistrationRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = SystemConstants.RegistrationUploadLimits.MaxRegistrationRequestBytes)]
    public async Task<ActionResult<ApiResponse<ApplicantDto>>> EnrollWithFiles(CancellationToken cancellationToken)
    {
        if (!Request.HasFormContentType)
            return Ok(ApiResponse<ApplicantDto>.Fail("Invalid registration upload request."));

        var json = Request.Form["data"].ToString();
        if (string.IsNullOrWhiteSpace(json))
            return Ok(ApiResponse<ApplicantDto>.Fail("Registration data is missing."));

        EnrollApplicantDto? dto;
        try
        {
            dto = JsonSerializer.Deserialize<EnrollApplicantDto>(json, EnrollJsonOptions);
        }
        catch
        {
            return Ok(ApiResponse<ApplicantDto>.Fail("Invalid registration data."));
        }

        if (dto is null)
            return Ok(ApiResponse<ApplicantDto>.Fail("Invalid registration data."));

        var credentialFiles = Request.Form.Files
            .Where(f => string.Equals(f.Name, "credentialFiles", StringComparison.OrdinalIgnoreCase))
            .ToList();
        var identityFile = Request.Form.Files
            .FirstOrDefault(f => string.Equals(f.Name, "identityFile", StringComparison.OrdinalIgnoreCase));

        return Ok(await _applicantService.EnrollWithDocumentsAsync(dto, credentialFiles, identityFile, cancellationToken));
    }

    [HttpGet("registration-documents")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ApplicantRegistrationDocumentDto>>>> AllRegistrationDocuments(CancellationToken cancellationToken)
        => Ok(await _applicantService.GetAllRegistrationDocumentsAsync(cancellationToken));

    [HttpGet("{id:int}/application-form")]
    public async Task<IActionResult> ApplicationForm(int id, [FromQuery] bool inline, CancellationToken cancellationToken)
    {
        var (pdf, fileName, error) = await _applicantService.GetApplicationFormPdfAsync(id, cancellationToken);
        if (pdf is null)
            return NotFound(new { success = false, message = error ?? "Application form not found." });
        if (inline)
            return File(pdf, "application/pdf");
        return File(pdf, "application/pdf", fileName);
    }

    [HttpGet("{id:int}/registration-documents")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ApplicantRegistrationDocumentDto>>>> RegistrationDocuments(
        int id,
        CancellationToken cancellationToken)
        => Ok(await _applicantService.GetRegistrationDocumentsAsync(id, cancellationToken));

    [HttpGet("{id:int}/registration-documents/{documentId:int}/download")]
    public async Task<IActionResult> DownloadRegistrationDocument(
        int id,
        int documentId,
        [FromQuery] bool inline,
        CancellationToken cancellationToken)
    {
        var (stream, contentType, fileName, error) =
            await _registrationStorage.OpenDocumentAsync(id, documentId, cancellationToken);
        if (stream is null)
            return NotFound(new { success = false, message = error ?? "Not found." });
        if (inline)
            return File(stream, contentType ?? "application/octet-stream");
        return File(stream, contentType ?? "application/octet-stream", fileName);
    }

    [HttpPut("{id:int}/registration")]
    public async Task<ActionResult<ApiResponse<ApplicantDto>>> UpdateRegistration(int id, [FromBody] UpdateApplicantRegistrationDto dto, CancellationToken cancellationToken)
        => Ok(await _applicantService.UpdateRegistrationAsync(id, dto, cancellationToken));

    [HttpPut("{id:int}/status")]
    public async Task<ActionResult<ApiResponse<ApplicantDto>>> UpdateStatus(int id, [FromBody] UpdateApplicantStatusDto dto, CancellationToken cancellationToken)
        => Ok(await _applicantService.UpdateStatusAsync(id, dto.Status, cancellationToken));

    [HttpPost("bulk-status")]
    public async Task<ActionResult<ApiResponse<object>>> BulkStatus([FromBody] BulkStatusDto dto, CancellationToken cancellationToken)
        => Ok(await _applicantService.BulkUpdateStatusAsync(dto, cancellationToken));

    [HttpPost("{id:int}/add-to-slot")]
    public async Task<ActionResult<ApiResponse<StudentDto>>> AddToSlot(int id, CancellationToken cancellationToken)
        => Ok(await _applicantService.AddToSlotAsync(id, cancellationToken));

    [HttpPost("confirm-slot")]
    public async Task<ActionResult<ApiResponse<ApplicantDto>>> ConfirmSlot([FromBody] ConfirmSlotDto dto, CancellationToken cancellationToken)
        => Ok(await _applicantService.ConfirmSlotAsync(dto.Token, cancellationToken));

    [HttpPost("decline-slot")]
    public async Task<ActionResult<ApiResponse<ApplicantDto>>> DeclineSlot([FromBody] ConfirmSlotDto dto, CancellationToken cancellationToken)
        => Ok(await _applicantService.DeclineSlotAsync(dto.Token, cancellationToken));
}
