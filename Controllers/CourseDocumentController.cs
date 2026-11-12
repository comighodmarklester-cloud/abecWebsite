using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using ABEC_System.Data;
using ABEC_System.Services;

namespace ABEC_System.Controllers;

[ApiController]
[Route("api/course-documents")]
public class CourseDocumentController : ControllerBase
{
    private readonly ICourseDocumentService _documents;

    public CourseDocumentController(ICourseDocumentService documents) => _documents = documents;

    [HttpPost("student/{studentId:int}/prepare")]
    public async Task<IActionResult> Prepare(int studentId, CancellationToken ct)
        => Ok(await _documents.PrepareAsync(studentId, ct));

    [HttpGet("student/{studentId:int}/eligibility")]
    public async Task<IActionResult> Eligibility(int studentId, [FromServices] ApplicationDbContext db, CancellationToken ct)
        => Ok(ApiResponse<object>.Ok((object?)await new StudentDocumentCatalog(db).GetVerificationAsync(studentId, ct) ?? new { }));

    [HttpPut("student/{studentId:int}/eligibility")]
    public async Task<IActionResult> VerifyEligibility(int studentId, UpdateDocumentEligibilityDto dto, [FromServices] ApplicationDbContext db, CancellationToken ct)
        => Ok(await new StudentDocumentCatalog(db).VerifyAsync(studentId, AdminId()!.Value, dto, ct));

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
        var owner = User.IsInRole("Admin") ? studentId : int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var (stream, contentType, fileName, error) = await _documents.OpenFileAsync(id, owner, AdminId(), cancellationToken);
        if (stream is null)
            return NotFound(new { success = false, message = error ?? "File not found." });
        if (inline)
            return File(stream, contentType ?? "application/octet-stream");
        return File(stream, contentType ?? "application/octet-stream", fileName ?? "document");
    }

    private int? AdminId()
    {
        return User.IsInRole("Admin") && int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
    }
}
