using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace ABEC_System.Controllers;

[ApiController]
[Route("api/document-requests")]
public class DocumentRequestController : ControllerBase
{
    private readonly IDocumentRequestService _documentService;

    public DocumentRequestController(IDocumentRequestService documentService) => _documentService = documentService;

    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<DocumentRequestDto>>>> GetAll([FromQuery] string? status, [FromQuery] int? batchId, CancellationToken cancellationToken)
        => Ok(await _documentService.GetAllAsync(status, cancellationToken, batchId));

    [HttpGet("dashboard")]
    public async Task<ActionResult<ApiResponse<DocumentRequestDashboardDto>>> GetDashboard([FromQuery] int? batchId, CancellationToken cancellationToken)
        => Ok(await _documentService.GetDashboardAsync(cancellationToken, batchId));

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ApiResponse<DocumentRequestDto>>> GetById(int id, CancellationToken cancellationToken)
        => Ok(await _documentService.GetByIdAsync(id, cancellationToken));

    [HttpGet("student/{studentId:int}")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<DocumentRequestDto>>>> GetByStudent(int studentId, CancellationToken cancellationToken)
        => Ok(await _documentService.GetByStudentAsync(studentId, cancellationToken));

    [HttpPost("student/{studentId:int}")]
    public async Task<ActionResult<ApiResponse<DocumentRequestDto>>> Create(int studentId, [FromBody] CreateDocumentRequestDto dto, CancellationToken cancellationToken)
        => Ok(await _documentService.CreateAsync(studentId, dto, cancellationToken));

    [HttpPut("{id:int}/status")]
    public async Task<ActionResult<ApiResponse<DocumentRequestDto>>> UpdateStatus(int id, [FromBody] UpdateDocumentStatusDto dto, CancellationToken cancellationToken)
        => Ok(await _documentService.UpdateStatusAsync(id, dto.Status, dto.HoldReason, cancellationToken));

    [HttpPost("{id:int}/file")]
    [RequestSizeLimit(20 * 1024 * 1024)]
    public async Task<ActionResult<ApiResponse<DocumentRequestDto>>> UploadFile(int id, IFormFile file, CancellationToken cancellationToken)
        => Ok(await _documentService.SaveReleaseFileAsync(id, file, cancellationToken));

    [HttpDelete("{id:int}/file")]
    public async Task<ActionResult<ApiResponse<DocumentRequestDto>>> RemoveFile(int id, CancellationToken cancellationToken)
        => Ok(await _documentService.RemoveReleaseFileAsync(id, cancellationToken));

    [HttpGet("{id:int}/file")]
    public async Task<IActionResult> DownloadFile(int id, [FromQuery] bool inline, CancellationToken cancellationToken)
    {
        var (stream, contentType, fileName, error) = await _documentService.OpenReleaseFileAsync(id, cancellationToken);
        if (stream is null)
            return NotFound(new { success = false, message = error ?? "File not found." });
        if (inline)
            return File(stream, contentType ?? "application/octet-stream");
        return File(stream, contentType ?? "application/octet-stream", fileName ?? "document");
    }

    [HttpGet("student/{studentId:int}/catalog")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<StudentDocumentCatalogItemDto>>>> GetStudentCatalog(int studentId, CancellationToken cancellationToken)
        => Ok(await _documentService.GetStudentCatalogAsync(studentId, cancellationToken));

    [HttpPost("bulk-status")]
    public async Task<ActionResult<ApiResponse<object>>> BulkStatus([FromBody] BulkStatusDto dto, CancellationToken cancellationToken)
        => Ok(await _documentService.BulkUpdateStatusAsync(dto, cancellationToken));
}
