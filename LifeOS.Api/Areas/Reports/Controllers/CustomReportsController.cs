using LifeOS.Core.Reports.DTOs;
using LifeOS.Core.Reports.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace LifeOS.Api.Areas.Reports.Controllers;

/// <summary>Custom reports (Session 93): the metric catalogue, running a definition, and saved definitions.</summary>
[ApiController]
[Area("Reports")]
[Route("api/[area]/Custom")]
[Authorize]
public class CustomReportsController(ICustomReportsService customReportsService) : ControllerBase
{
    /// <summary>GET api/Reports/Custom/metrics — what a custom report can count.</summary>
    [HttpGet("metrics")]
    public IActionResult Metrics() => Ok(ApiResponse<IReadOnlyList<CustomMetricDto>>.Ok(customReportsService.Metrics()));

    /// <summary>POST api/Reports/Custom/run { metric, lifeAreaId, tagId, grouping, compare, rangePreset | from+to, today, timeZone }</summary>
    [HttpPost("run")]
    public async Task<IActionResult> Run(CustomReportRunRequest request) =>
        Result(await customReportsService.RunAsync(request, request.Today, request.TimeZone));

    [HttpGet]
    public async Task<IActionResult> List() => Ok(ApiResponse<List<SavedReportDto>>.Ok(await customReportsService.ListAsync()));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var result = await customReportsService.GetAsync(id);
        return result.Success ? Ok(ApiResponse<SavedReportDto>.Ok(result.Data)) : NotFound(ApiResponse<SavedReportDto>.Fail(result.Error!));
    }

    /// <summary>GET api/Reports/Custom/5/run?today=2026-10-22&amp;tz=Asia/Kolkata — reruns a saved definition from scratch.</summary>
    [HttpGet("{id:int}/run")]
    public async Task<IActionResult> RunSaved(int id, [FromQuery, BindRequired] DateOnly today, [FromQuery] string? tz) =>
        Result(await customReportsService.RunSavedAsync(id, today, tz));

    [HttpPost]
    public async Task<IActionResult> Create(SavedReportRequest request, [FromQuery, BindRequired] DateOnly today) =>
        Result(await customReportsService.CreateAsync(request, today));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, SavedReportRequest request, [FromQuery, BindRequired] DateOnly today) =>
        Result(await customReportsService.UpdateAsync(id, request, today));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await customReportsService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    private IActionResult Result<T>(OperationResult<T> result) =>
        result.Success ? Ok(ApiResponse<T>.Ok(result.Data)) : BadRequest(ApiResponse<T>.Fail(result.Error!));
}
