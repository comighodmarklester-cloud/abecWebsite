using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace ABEC_System.Controllers;

[ApiController]
[Route("api/batches")]
public class BatchApiController : ControllerBase
{
    /// <summary>View applicants, students, archives and documents for one batch.</summary>
    [HttpGet("{id:int}/documents")]
    public async Task<IActionResult> Documents(int id, [FromServices] ABEC_System.Services.IBatchDocumentService documents, CancellationToken cancellationToken)
    {
        var result = await documents.GetAsync(id, cancellationToken);
        return result.Success ? Ok(result) : NotFound(result);
    }

    private readonly IBatchService _batchService;

    public BatchApiController(IBatchService batchService) => _batchService = batchService;

    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<BatchDto>>>> GetAll(CancellationToken cancellationToken)
        => Ok(await _batchService.GetAllAsync(cancellationToken));

    [HttpGet("active")]
    public async Task<ActionResult<ApiResponse<BatchDto?>>> GetActive(CancellationToken cancellationToken)
        => Ok(await _batchService.GetActiveAsync(cancellationToken));

    [HttpGet("history")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<BatchDto>>>> GetHistory(CancellationToken cancellationToken)
        => Ok(await _batchService.GetHistoryAsync(cancellationToken));

    [HttpGet("switch-impact")]
    public async Task<ActionResult<ApiResponse<BatchSwitchImpactDto>>> GetSwitchImpact(
        [FromQuery] int? targetBatchId,
        CancellationToken cancellationToken)
        => Ok(await _batchService.GetSwitchImpactAsync(targetBatchId, cancellationToken));

    [HttpGet("{id:int}/students")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<StudentDto>>>> GetStudents(
        int id,
        CancellationToken cancellationToken)
        => Ok(await _batchService.GetStudentsAsync(id, cancellationToken));

    [HttpPost]
    public async Task<ActionResult<ApiResponse<BatchDto>>> Create(
        [FromBody] CreateBatchDto dto,
        CancellationToken cancellationToken)
        => Ok(await _batchService.CreateAsync(dto, cancellationToken));

    [HttpPut("{id:int}/activate")]
    public async Task<ActionResult<ApiResponse<BatchDto>>> Activate(
        int id,
        [FromBody] ActivateBatchDto? dto,
        CancellationToken cancellationToken)
        => Ok(await _batchService.ActivateAsync(id, dto?.ConfirmSwitch == true, cancellationToken));

    [HttpPost("{id:int}/complete")]
    public async Task<ActionResult<ApiResponse<BatchDto>>> Complete(int id, CancellationToken cancellationToken)
        => Ok(await _batchService.CompleteAsync(id, cancellationToken));
}
