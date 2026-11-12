using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ABEC_System.Services;
using ABEC_System.Data;

namespace ABEC_System.Controllers;

[ApiController]
[Route("api/archives")]
public class ArchiveController : ControllerBase
{
    private readonly IArchiveService _archiveService;

    public ArchiveController(IArchiveService archiveService) => _archiveService = archiveService;

    // An explicitly labeled aggregate-only report; ordinary archive lists still default to the active batch.
    // The global BatchAccessFilter protects every Archive action with server-issued admin identity.
    [HttpGet("statistics")]
    public async Task<IActionResult> Statistics([FromQuery] int? batchId,
        [FromServices] ApplicationDbContext db, CancellationToken cancellationToken)
    {
        if (batchId is <= 0) return BadRequest(new { success = false, message = "Select a valid batch." });
        var batchName = "All Batches";
        if (batchId.HasValue)
        {
            var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchId == batchId.Value, cancellationToken);
            if (batch is null) return NotFound(new { success = false, message = "The selected batch was not found." });
            batchName = batch.BatchName;
        }
        var query = db.Archives.AsNoTracking().Where(a => a.Student != null);
        if (batchId.HasValue) query = query.Where(a => a.Student!.BatchId == batchId.Value);
        var records = await query.Select(a => new ArchiveReportEntry(a.ArchiveId, a.StudentId,
            a.Student!.BatchId, a.ArchiveReason, a.ArchiveDate)).ToListAsync(cancellationToken);
        return Ok(ApiResponse<ArchiveReportStatistics>.Ok(ArchiveReportStatistics.Build(records, batchId, batchName)));
    }

    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ArchiveDto>>>> GetAll([FromQuery] string? reason, [FromQuery] int? batchId, CancellationToken cancellationToken)
        => Ok(await _archiveService.GetAllAsync(reason, cancellationToken, batchId));

    // Aggregate-only reporting across batches. BatchAccessFilter limits Archive actions to administrators.
    [HttpGet("categories")]
    public async Task<IActionResult> Categories([FromQuery] int? batchId, [FromQuery] int? courseId,
        [FromServices] ApplicationDbContext db, CancellationToken cancellationToken)
    {
        if (batchId is <= 0 || courseId is <= 0)
            return BadRequest(new { success = false, message = "Select a valid batch and course." });
        var batchName = "All Batches";
        var courseName = "All Courses";
        if (batchId.HasValue)
        {
            var batch = await db.Batches.AsNoTracking().SingleOrDefaultAsync(b => b.BatchId == batchId, cancellationToken);
            if (batch is null) return NotFound(new { success = false, message = "The selected batch was not found." });
            batchName = batch.BatchName;
        }
        if (courseId.HasValue)
        {
            var course = await db.Courses.AsNoTracking().SingleOrDefaultAsync(c => c.CourseId == courseId, cancellationToken);
            if (course is null) return NotFound(new { success = false, message = "The selected course was not found." });
            courseName = course.CourseName;
        }
        var archives = db.Archives.AsNoTracking().Where(a => a.Student != null);
        var applicants = db.Applicants.AsNoTracking().Where(a => a.Student == null);
        if (batchId.HasValue)
        {
            archives = archives.Where(a => a.Student!.BatchId == batchId);
            applicants = applicants.Where(a => a.BatchId == batchId);
        }
        if (courseId.HasValue)
        {
            archives = archives.Where(a => a.Student!.Applicant != null && a.Student.Applicant.CourseId == courseId);
            applicants = applicants.Where(a => a.CourseId == courseId);
        }
        var records = await archives.Select(a => new ArchiveCategoryEntry(a.ArchiveId, a.StudentId,
            a.Student!.ApplicantId, a.Student.BatchId, a.Student.Applicant != null ? a.Student.Applicant.CourseId : 0,
            a.ArchiveReason, a.ArchiveDate)).ToListAsync(cancellationToken);
        var slots = await applicants.Where(a => a.ApplicationStatus == "Declined" || a.ApplicationStatus == "Rejected")
            .Select(a => new RejectedSlotEntry(a.ApplicantId, a.BatchId, a.CourseId,
                a.ApplicationStatus, a.SlotResponse, a.DeclinedAt, false)).ToListAsync(cancellationToken);
        return Ok(ApiResponse<ArchiveCategoryStatistics>.Ok(
            ArchiveCategoryStatistics.Build(records, slots, batchId, batchName, courseId, courseName)));
    }

    [HttpPost]
    public async Task<ActionResult<ApiResponse<ArchiveDto>>> Create([FromBody] CreateArchiveDto dto, CancellationToken cancellationToken)
        => Ok(await _archiveService.CreateAsync(dto, cancellationToken));

    [HttpPost("students/{studentId:int}")]
    public async Task<ActionResult<ApiResponse<object>>> ArchiveStudent(int studentId, [FromBody] CreateArchiveDto dto, CancellationToken cancellationToken)
        => Ok(await _archiveService.ArchiveStudentFromCourseAsync(studentId, dto.ArchiveReason, dto.SpecificReason, cancellationToken));
}
