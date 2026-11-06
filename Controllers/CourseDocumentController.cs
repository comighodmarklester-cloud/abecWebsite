using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace ABEC_System.Controllers;

[ApiController]
[Route("api/course-documents")]
public class CourseDocumentController : ControllerBase
{
    private readonly ICourseDocumentService _documents;

    public CourseDocumentController(ICourseDocumentService documents) => _documents = documents;

    [HttpGet("board")]
    public async Task<ActionResult<ApiResponse<CourseReleaseBoardDto>>> GetBoard(
        [FromQuery] int courseId,
        [FromQuery] int? batchId,
        CancellationToken cancellationToken)
        => Ok(await _documents.GetBoardAsync(courseId, batchId, cancellationToken));

    [HttpGet("student/{studentId:int}")]
    public async Task<ActionResult<ApiResponse<StudentCourseReleaseDto>>> GetStudent(int studentId, CancellationToken cancellationToken)
        => Ok(await _documents.GetStudentReleaseAsync(studentId, cancellationToken));

    [HttpPost("{id:int}/file")]
    [RequestSizeLimit(20 * 1024 * 1024)]
    public async Task<ActionResult<ApiResponse<StudentCourseDocumentDto>>> Upload(int id, IFormFile file, CancellationToken cancellationToken)
        => Ok(await _documents.UploadAsync(id, file, AdminId(), cancellationToken));

    [HttpPost("{id:int}/release")]
    public async Task<ActionResult<ApiResponse<StudentCourseDocumentDto>>> Release(int id, CancellationToken cancellationToken)
        => Ok(await _documents.ReleaseAsync(id, AdminId(), cancellationToken));

    [HttpPut("batches/{batchId:int}/assessment")]
    public async Task<ActionResult<ApiResponse<CourseReleaseTimelineDto>>> SetAssessment(
        int batchId,
        [FromBody] UpdateBatchAssessmentDto dto,
        CancellationToken cancellationToken)
        => Ok(await _documents.SetAssessmentDateAsync(batchId, dto.AssessmentDate, cancellationToken));

    [HttpGet("{id:int}/file")]
    public async Task<IActionResult> Download(int id, [FromQuery] int? studentId, [FromQuery] bool inline, CancellationToken cancellationToken)
    {
        var (stream, contentType, fileName, error) = await _documents.OpenFileAsync(id, studentId, AdminId(), cancellationToken);
        if (stream is null)
            return NotFound(new { success = false, message = error ?? "File not found." });
        if (inline)
            return File(stream, contentType ?? "application/octet-stream");
        return File(stream, contentType ?? "application/octet-stream", fileName ?? "document");
    }

    private int? AdminId()
    {
        if (!Request.Headers.TryGetValue("X-Abec-Admin-Id", out var value)) return null;
        return int.TryParse(value.ToString(), out var id) && id > 0 ? id : null;
    }
}
