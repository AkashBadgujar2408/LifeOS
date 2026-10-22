using LifeOS.Api.Infrastructure;
using LifeOS.Core.Reports.DTOs;
using LifeOS.Core.Reports.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace LifeOS.Api.Areas.Reports.Controllers;

[ApiController]
[Area("Reports")]
[Route("api/[area]")]
[Authorize]
public class ReportsController(IReportsService reportsService) : ControllerBase
{
    /// <summary>GET api/Reports/Goals?from=2026-01-01&amp;to=2026-12-31&amp;today=2026-10-21&amp;tz=Asia/Kolkata</summary>
    [HttpGet("Goals")]
    public async Task<IActionResult> Goals(
        [FromQuery, BindRequired] DateOnly from,
        [FromQuery, BindRequired] DateOnly to,
        [FromQuery, BindRequired] DateOnly today,
        [FromQuery] string? tz)
    {
        var result = await reportsService.GetGoalReportAsync(from, to, today, tz);
        return result.Success
            ? Ok(ApiResponse<GoalReportDto>.Ok(result.Data))
            : BadRequest(ApiResponse<GoalReportDto>.Fail(result.Error!));
    }

    /// <summary>GET api/Reports/Habits?from=2026-01-01&amp;to=2026-12-31&amp;today=2026-10-21&amp;tz=Asia/Kolkata</summary>
    [HttpGet("Habits")]
    public async Task<IActionResult> Habits(
        [FromQuery, BindRequired] DateOnly from,
        [FromQuery, BindRequired] DateOnly to,
        [FromQuery, BindRequired] DateOnly today,
        [FromQuery] string? tz)
    {
        var result = await reportsService.GetHabitReportAsync(from, to, today, tz);
        return result.Success
            ? Ok(ApiResponse<HabitReportDto>.Ok(result.Data))
            : BadRequest(ApiResponse<HabitReportDto>.Fail(result.Error!));
    }

    /// <summary>GET api/Reports/Productivity?from=2026-01-01&amp;to=2026-12-31&amp;today=2026-10-22&amp;tz=Asia/Kolkata</summary>
    [HttpGet("Productivity")]
    public async Task<IActionResult> Productivity(
        [FromQuery, BindRequired] DateOnly from,
        [FromQuery, BindRequired] DateOnly to,
        [FromQuery, BindRequired] DateOnly today,
        [FromQuery] string? tz) =>
        Result(await reportsService.GetProductivityReportAsync(from, to, today, tz));

    /// <summary>GET api/Reports/Learning?from=2026-01-01&amp;to=2026-12-31&amp;today=2026-10-22&amp;tz=Asia/Kolkata</summary>
    [HttpGet("Learning")]
    public async Task<IActionResult> Learning(
        [FromQuery, BindRequired] DateOnly from,
        [FromQuery, BindRequired] DateOnly to,
        [FromQuery, BindRequired] DateOnly today,
        [FromQuery] string? tz) =>
        Result(await reportsService.GetLearningReportAsync(from, to, today, tz));

    /// <summary>GET api/Reports/Health?… — health figures, so 423 without the vault unlock like every Health endpoint.</summary>
    [HttpGet("Health")]
    [VaultUnlockRequired]
    public async Task<IActionResult> Health(
        [FromQuery, BindRequired] DateOnly from,
        [FromQuery, BindRequired] DateOnly to,
        [FromQuery, BindRequired] DateOnly today,
        [FromQuery] string? tz) =>
        Result(await reportsService.GetHealthReportAsync(from, to, today, tz));

    private IActionResult Result<T>(OperationResult<T> result) =>
        result.Success ? Ok(ApiResponse<T>.Ok(result.Data)) : BadRequest(ApiResponse<T>.Fail(result.Error!));
}
