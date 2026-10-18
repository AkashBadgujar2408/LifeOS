using LifeOS.Core.Learning.DTOs;
using LifeOS.Core.Learning.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Learning.Controllers;

[ApiController]
[Area("Learning")]
[Route("api/[area]/[controller]")]
[Authorize]
public class RoadmapsController(IRoadmapsService roadmapsService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(ApiResponse<List<RoadmapDto>>.Ok(await roadmapsService.GetAllAsync()));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id) => NotFoundOr(await roadmapsService.GetAsync(id));

    [HttpPost]
    public async Task<IActionResult> Create(RoadmapRequest request) => BadRequestOr(await roadmapsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, RoadmapRequest request) => BadRequestOr(await roadmapsService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await roadmapsService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    [HttpPost("{id:int}/steps")]
    public async Task<IActionResult> AddStep(int id, RoadmapStepRequest request) => BadRequestOr(await roadmapsService.AddStepAsync(id, request));

    [HttpPut("{id:int}/steps/{stepId:int}")]
    public async Task<IActionResult> UpdateStep(int id, int stepId, RoadmapStepRequest request) =>
        BadRequestOr(await roadmapsService.UpdateStepAsync(id, stepId, request));

    /// <summary>PUT api/Learning/Roadmaps/3/steps/9/completed { "completed": true }</summary>
    [HttpPut("{id:int}/steps/{stepId:int}/completed")]
    public async Task<IActionResult> SetStepCompleted(int id, int stepId, SetStepCompletedRequest request)
    {
        var result = await roadmapsService.SetStepCompletedAsync(id, stepId, request.Completed);
        return result.Success
            ? Ok(ApiResponse<StepCompletedResultDto>.Ok(result.Data))
            : BadRequest(ApiResponse<StepCompletedResultDto>.Fail(result.Error!));
    }

    [HttpPut("{id:int}/steps/order")]
    public async Task<IActionResult> ReorderSteps(int id, ReorderStepsRequest request) =>
        BadRequestOr(await roadmapsService.ReorderStepsAsync(id, request.StepIds));

    [HttpDelete("{id:int}/steps/{stepId:int}")]
    public async Task<IActionResult> DeleteStep(int id, int stepId) => BadRequestOr(await roadmapsService.DeleteStepAsync(id, stepId));

    private IActionResult NotFoundOr(OperationResult<RoadmapDetailDto> result) =>
        result.Success ? Ok(ApiResponse<RoadmapDetailDto>.Ok(result.Data)) : NotFound(ApiResponse<RoadmapDetailDto>.Fail(result.Error!));

    private IActionResult BadRequestOr(OperationResult<RoadmapDetailDto> result) =>
        result.Success ? Ok(ApiResponse<RoadmapDetailDto>.Ok(result.Data)) : BadRequest(ApiResponse<RoadmapDetailDto>.Fail(result.Error!));
}
