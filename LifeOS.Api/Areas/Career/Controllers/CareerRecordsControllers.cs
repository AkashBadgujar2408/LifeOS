using LifeOS.Core.Career.DTOs;
using LifeOS.Core.Career.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Career.Controllers;

/// <summary>api/Career/ResumeVersions — the files themselves go through api/Shared/Attachments (type ResumeVersion).</summary>
[ApiController]
[Area("Career")]
[Route("api/[area]/[controller]")]
[Authorize]
public class ResumeVersionsController(IResumeVersionsService resumesService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(ApiResponse<List<ResumeVersionDto>>.Ok(await resumesService.GetAllAsync()));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var result = await resumesService.GetAsync(id);
        return result.Success
            ? Ok(ApiResponse<ResumeVersionDto>.Ok(result.Data))
            : NotFound(ApiResponse<ResumeVersionDto>.Fail(result.Error!));
    }

    [HttpPost]
    public async Task<IActionResult> Create(ResumeVersionRequest request) => Result(await resumesService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, ResumeVersionRequest request) => Result(await resumesService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await resumesService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    private IActionResult Result(OperationResult<ResumeVersionDto> result) =>
        result.Success ? Ok(ApiResponse<ResumeVersionDto>.Ok(result.Data)) : BadRequest(ApiResponse<ResumeVersionDto>.Fail(result.Error!));
}

/// <summary>api/Career/PerformanceReviews — latest first.</summary>
[ApiController]
[Area("Career")]
[Route("api/[area]/[controller]")]
[Authorize]
public class PerformanceReviewsController(IPerformanceReviewsService reviewsService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(ApiResponse<List<PerformanceReviewDto>>.Ok(await reviewsService.GetAllAsync()));

    [HttpPost]
    public async Task<IActionResult> Create(PerformanceReviewRequest request) => Result(await reviewsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, PerformanceReviewRequest request) => Result(await reviewsService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await reviewsService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    private IActionResult Result(OperationResult<PerformanceReviewDto> result) =>
        result.Success ? Ok(ApiResponse<PerformanceReviewDto>.Ok(result.Data)) : BadRequest(ApiResponse<PerformanceReviewDto>.Fail(result.Error!));
}

/// <summary>api/Career/SideIncomeSources — active, paused, then ended.</summary>
[ApiController]
[Area("Career")]
[Route("api/[area]/[controller]")]
[Authorize]
public class SideIncomeSourcesController(ISideIncomeSourcesService sourcesService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(ApiResponse<List<SideIncomeSourceDto>>.Ok(await sourcesService.GetAllAsync()));

    [HttpPost]
    public async Task<IActionResult> Create(SideIncomeSourceRequest request) => Result(await sourcesService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, SideIncomeSourceRequest request) => Result(await sourcesService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await sourcesService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    private IActionResult Result(OperationResult<SideIncomeSourceDto> result) =>
        result.Success ? Ok(ApiResponse<SideIncomeSourceDto>.Ok(result.Data)) : BadRequest(ApiResponse<SideIncomeSourceDto>.Fail(result.Error!));
}
