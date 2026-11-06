using Microsoft.AspNetCore.RateLimiting;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using ABEC_System.DTOs;
using ABEC_System.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace ABEC_System.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService) => _authService = authService;

    [HttpPost("admin-login")]
    public async Task<ActionResult<ApiResponse<AuthResultDto>>> AdminLogin([FromBody] AdminLoginDto dto, CancellationToken cancellationToken)
    {
        AttachClientMeta(dto);
        return Ok(await _authService.AdminLoginAsync(dto, cancellationToken));
    }

    [EnableRateLimiting("StudentLogin")]
    [HttpPost("student-login")]
    public async Task<ActionResult<ApiResponse<AuthResultDto>>> StudentLogin([FromBody] StudentLoginDto dto, CancellationToken cancellationToken)
    {
        dto.ClientIp ??= HttpContext.Connection.RemoteIpAddress?.ToString();
        if (string.IsNullOrWhiteSpace(dto.UserAgent))
            dto.UserAgent = Request.Headers.UserAgent.ToString();
        var result = await _authService.StudentLoginAsync(dto, cancellationToken);
        await SignInStudentAsync(result);
        return Ok(result);
    }

    [HttpPost("register")]
    public async Task<ActionResult<ApiResponse<AuthResultDto>>> Register([FromBody] StudentRegisterDto dto, CancellationToken cancellationToken)
    {
        var result = await _authService.RegisterStudentAsync(dto, cancellationToken);
        await SignInStudentAsync(result);
        return Ok(result);
    }

    private async Task SignInStudentAsync(ApiResponse<AuthResultDto> result)
    {
        if (result.Success && result.Data is not null)
        {
            var identity = new ClaimsIdentity(new[] {
                new Claim(ClaimTypes.NameIdentifier, result.Data.UserId.ToString()),
                new Claim(ClaimTypes.Role, "Student")
            }, "StudentSession");
            await HttpContext.SignInAsync("StudentSession", new ClaimsPrincipal(identity));
        }
    }

    [HttpPost("student-logout")]
    public async Task<IActionResult> StudentLogout()
    {
        await HttpContext.SignOutAsync("StudentSession");
        return Ok(ApiResponse<object>.Ok(new { }, "Signed out."));
    }

    private void AttachClientMeta(AdminLoginDto dto)
    {
        dto.ClientIp ??= HttpContext.Connection.RemoteIpAddress?.ToString();
        if (string.IsNullOrWhiteSpace(dto.UserAgent))
            dto.UserAgent = Request.Headers.UserAgent.ToString();
    }
}
