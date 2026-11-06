using ABEC_System.DTOs;
using ABEC_System.Services;
using Microsoft.AspNetCore.Mvc;

namespace ABEC_System.Controllers;

[ApiController]
[Route("api/locations")]
public class LocationController : ControllerBase
{
    private readonly ILocationService _locations;

    public LocationController(ILocationService locations) => _locations = locations;

    [HttpGet("provinces")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<LocationOptionDto>>>> Provinces(CancellationToken cancellationToken)
        => Ok(await _locations.GetProvincesAsync(cancellationToken));

    [HttpGet("provinces/{provinceCode}/cities")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<LocationOptionDto>>>> Cities(string provinceCode, CancellationToken cancellationToken)
        => Ok(await _locations.GetCitiesAsync(provinceCode, cancellationToken));

    [HttpGet("cities/{cityCode}/barangays")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<LocationOptionDto>>>> Barangays(string cityCode, CancellationToken cancellationToken)
        => Ok(await _locations.GetBarangaysAsync(cityCode, cancellationToken));
}
