using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace ABEC_System.Controllers;

[ApiController]
[Route("api/courses")]
public class CourseController : ControllerBase
{
    private readonly ICourseService _courseService;

    public CourseController(ICourseService courseService) => _courseService = courseService;

    [HttpPost]
    public async Task<ActionResult<ApiResponse<CourseDto>>> Create([FromBody] CreateCourseDto dto, CancellationToken cancellationToken)
        => Ok(await _courseService.CreateAsync(dto, cancellationToken));

    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<CourseDto>>>> GetAll(CancellationToken cancellationToken)
        => Ok(await _courseService.GetAllAsync(cancellationToken));

    [HttpGet("history")]
    public async Task<ActionResult<ApiResponse<CourseHistoryPageDto>>> GetHistory(
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 12,
        CancellationToken cancellationToken = default)
        => Ok(await _courseService.GetHistoryAsync(search, page, pageSize, cancellationToken));

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ApiResponse<CourseDto>>> GetById(int id, CancellationToken cancellationToken)
        => Ok(await _courseService.GetByIdAsync(id, cancellationToken));

    [HttpPost("{id:int}/slots")]
    public async Task<ActionResult<ApiResponse<CourseDto>>> SetSlotCapacity(int id, [FromBody] AddCourseSlotsDto? dto, CancellationToken cancellationToken)
    {
        var capacity = dto?.SlotCapacity ?? 0;
        if (capacity < 1)
            return Ok(ApiResponse<CourseDto>.Fail("Enter a whole number of slots from 1 to 500."));
        return Ok(await _courseService.SetSlotCapacityAsync(id, capacity, cancellationToken));
    }

    [HttpGet("{id:int}/students")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<StudentDto>>>> GetStudents(int id, [FromQuery] string? search, [FromQuery] int? batchId, CancellationToken cancellationToken)
        => Ok(await _courseService.GetEnrolledStudentsAsync(id, search, cancellationToken, batchId));
}
