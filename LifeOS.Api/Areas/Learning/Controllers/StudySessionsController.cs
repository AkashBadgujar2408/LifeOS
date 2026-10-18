using LifeOS.Core.Learning.DTOs;
using LifeOS.Core.Learning.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace LifeOS.Api.Areas.Learning.Controllers;

[ApiController]
[Area("Learning")]
[Route("api/[area]/[controller]")]
[Authorize]
public class StudySessionsController(IStudySessionsService studySessionsService) : ControllerBase
{
    /// <summary>GET api/Learning/StudySessions?from=2026-09-19&amp;to=2026-10-18 — local days, newest first.</summary>
    [HttpGet]
    public async Task<IActionResult> GetRange([FromQuery, BindRequired] DateOnly from, [FromQuery, BindRequired] DateOnly to)
    {
        var result = await studySessionsService.GetRangeAsync(from, to);
        return result.Success
            ? Ok(ApiResponse<List<StudySessionDto>>.Ok(result.Data))
            : BadRequest(ApiResponse<List<StudySessionDto>>.Fail(result.Error!));
    }

    /// <summary>GET api/Learning/StudySessions/analytics?today=2026-10-18&amp;weeks=12 — minutes by subject per week.</summary>
    [HttpGet("analytics")]
    public async Task<IActionResult> GetAnalytics([FromQuery, BindRequired] DateOnly today, [FromQuery] int weeks = 12)
    {
        var result = await studySessionsService.GetAnalyticsAsync(today, weeks);
        return result.Success
            ? Ok(ApiResponse<StudyAnalyticsDto>.Ok(result.Data))
            : BadRequest(ApiResponse<StudyAnalyticsDto>.Fail(result.Error!));
    }

    [HttpPost]
    public async Task<IActionResult> Create(StudySessionRequest request) => Result(await studySessionsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, StudySessionRequest request) => Result(await studySessionsService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await studySessionsService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    private IActionResult Result(OperationResult<StudySessionDto> result) =>
        result.Success ? Ok(ApiResponse<StudySessionDto>.Ok(result.Data)) : BadRequest(ApiResponse<StudySessionDto>.Fail(result.Error!));
}
