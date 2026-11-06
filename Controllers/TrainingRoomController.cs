using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace ABEC_System.Controllers;

[ApiController]
[Route("api/training-rooms")]
public class TrainingRoomController : ControllerBase
{
    private readonly ITrainingRoomService _rooms;

    public TrainingRoomController(ITrainingRoomService rooms) => _rooms = rooms;

    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<TrainingRoomDto>>>> GetAll(CancellationToken cancellationToken)
        => Ok(await _rooms.GetAllAsync(cancellationToken));

    [HttpPost]
    public async Task<ActionResult<ApiResponse<TrainingRoomDto>>> Create([FromBody] CreateTrainingRoomDto dto, CancellationToken cancellationToken)
        => Ok(await _rooms.CreateAsync(dto, cancellationToken));
}
