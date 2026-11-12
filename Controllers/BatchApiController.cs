using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using ABEC_System.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

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

    [HttpGet("{id:int}/report")]
    [HttpGet("report")]
    public async Task<IActionResult> DownloadReport([FromRoute] int? id, [FromQuery] int? batchId, [FromQuery] int? courseId,
        [FromServices] ABEC_System.Data.ApplicationDbContext db, CancellationToken cancellationToken)
    {
        if (id is <= 0 || batchId is <= 0 || courseId is <= 0 || (id.HasValue && batchId.HasValue && id != batchId))
            return BadRequest(new { success = false, message = "Select a valid batch and course." });
        var selectedBatchId = id ?? batchId;
        // BatchApi is protected by the existing server-issued admin identity filter.
        // Read every matching record in one snapshot; no table page or page-size limit applies.
        await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, cancellationToken);
        var batch = selectedBatchId.HasValue
            ? await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchId == selectedBatchId, cancellationToken) : null;
        if (selectedBatchId.HasValue && batch is null)
            return NotFound(new { success = false, message = "The selected batch was not found." });
        var course = courseId.HasValue
            ? await db.Courses.AsNoTracking().SingleOrDefaultAsync(c => c.CourseId == courseId, cancellationToken) : null;
        if (courseId.HasValue && course is null)
            return NotFound(new { success = false, message = "The selected course was not found." });
        var applicantQuery = db.Applicants.AsNoTracking().Include(a => a.Course).Include(a => a.Batch).Include(a => a.Student).AsQueryable();
        var studentQuery = db.Students.AsNoTracking().Include(s => s.Applicant)!.ThenInclude(a => a!.Course)
            .Include(s => s.Batch).Include(s => s.Archives).AsQueryable();
        if (selectedBatchId.HasValue)
        {
            applicantQuery = applicantQuery.Where(a => a.BatchId == selectedBatchId);
            studentQuery = studentQuery.Where(s => s.BatchId == selectedBatchId);
        }
        if (courseId.HasValue)
        {
            applicantQuery = applicantQuery.Where(a => a.CourseId == courseId);
            studentQuery = studentQuery.Where(s => s.Applicant != null && s.Applicant.CourseId == courseId);
        }
        var applicants = await applicantQuery.ToListAsync(cancellationToken);
        var students = await studentQuery.ToListAsync(cancellationToken);
        var scope = new ReportExportScope(selectedBatchId, batch?.BatchName ?? "All Batches", courseId, course?.CourseName ?? "All Courses");
        var report = ReportExportData.Build(scope, applicants, students);
        await transaction.CommitAsync(cancellationToken);
        var pdf = BatchReportPdf.Create(report);
        var safeName = System.Text.RegularExpressions.Regex.Replace(scope.BatchName, "[^A-Za-z0-9_-]+", "_").Trim('_');
        if (string.IsNullOrEmpty(safeName)) safeName = "Batch_" + selectedBatchId;
        Response.Headers.CacheControl = "no-store";
        return File(pdf, "application/pdf", $"ABEC_Report_{safeName}.pdf");
    }

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
