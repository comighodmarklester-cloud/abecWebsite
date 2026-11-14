using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace ABEC_System.Controllers;

[ApiController]
[Route("api/activations")]
public class ActivationController : ControllerBase
{
    private readonly IActivationService _activationService;

    public ActivationController(IActivationService activationService) => _activationService = activationService;

    [HttpGet("summary")]
    public async Task<ActionResult<ApiResponse<ActivationSummaryDto>>> Summary([FromQuery] int? batchId, CancellationToken cancellationToken)
        => Ok(await _activationService.GetSummaryAsync(cancellationToken, batchId));

    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<StudentDto>>>> GetAll(
        [FromQuery] string? status,
        [FromQuery] int? courseId,
        [FromQuery] string? search,
        [FromQuery] int? batchId,
        CancellationToken cancellationToken)
        => Ok(await _activationService.GetAccountsAsync(status, courseId, search, cancellationToken, batchId));

    [HttpPost("{id:int}/generate-pin")]
    public async Task<IActionResult> GeneratePin(int id, CancellationToken cancellationToken, [FromQuery] int? pinVersion = null, [FromQuery] bool onlyLegacy = false)
    {
        var result = await _activationService.GeneratePinAsync(id, cancellationToken, pinVersion, onlyLegacy);
        // Only this explicit administrative reissue exposes the newly issued code.
        Response.Headers.CacheControl = "no-store";
        return result.Success && result.Data is not null
            ? Ok(ApiResponse<object>.Ok(new { result.Data.StudentId, result.Data.SecurityPin,
                PinChanged = !onlyLegacy || result.Data.SecurityPinVersion != pinVersion }, result.Message))
            : Ok(ApiResponse<object>.Fail(result.Message));
    }

    [HttpGet("{id:int}/security-pin")]
    public async Task<ActionResult<ApiResponse<SecurityPinDto>>> SecurityPin(int id, CancellationToken cancellationToken)
    {
        // BatchAccessFilter restricts Activation actions to authenticated Admins.
        Response.Headers.CacheControl = "no-store";
        return Ok(await _activationService.GetSecurityPinAsync(id, cancellationToken));
    }

    [HttpPost("{id:int}/activate")]
    public async Task<ActionResult<ApiResponse<StudentDto>>> Activate(int id, CancellationToken cancellationToken)
        => Ok(await _activationService.ActivateAsync(id, cancellationToken));

    [HttpPost("{id:int}/deactivate")]
    public async Task<ActionResult<ApiResponse<StudentDto>>> Deactivate(int id, [FromBody] DeactivateAccountDto dto, CancellationToken cancellationToken)
        => Ok(await _activationService.DeactivateAsync(id, dto.ArchiveReason, dto.SpecificReason, cancellationToken));

    [HttpPost("{id:int}/reactivate")]
    public async Task<ActionResult<ApiResponse<StudentDto>>> Reactivate(int id, CancellationToken cancellationToken)
        => Ok(await _activationService.ReactivateAsync(id, cancellationToken));

    [HttpPost("bulk-status")]
    public async Task<ActionResult<ApiResponse<object>>> BulkStatus([FromBody] BulkStatusDto dto, CancellationToken cancellationToken)
        => Ok(await _activationService.BulkUpdateStatusAsync(dto, cancellationToken));

    [HttpGet("{id:int}/activation-notice")]
    public async Task<IActionResult> ActivationNotice(int id, CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        var result = await _activationService.GetActivationNoticePdfAsync(id, cancellationToken);
        if (!result.Success || result.Data is null)
            return BadRequest(result);

        var fileName = $"ABEC_Activation_Notice_{id}.pdf";
        return File(result.Data, "application/pdf", fileName);
    }
}
