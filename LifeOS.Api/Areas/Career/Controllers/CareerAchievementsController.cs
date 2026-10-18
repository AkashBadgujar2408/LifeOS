using LifeOS.Core.Career.DTOs;
using LifeOS.Core.Career.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Career.Controllers;

[ApiController]
[Area("Career")]
[Route("api/[area]/[controller]")]
[Authorize]
public class CareerAchievementsController(ICareerAchievementsService achievementsService) : ControllerBase
{
    /// <summary>GET api/Career/CareerAchievements — latest first.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll() =>
        Ok(ApiResponse<List<CareerAchievementDto>>.Ok(await achievementsService.GetAllAsync()));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var result = await achievementsService.GetAsync(id);
        return result.Success
            ? Ok(ApiResponse<CareerAchievementDto>.Ok(result.Data))
            : NotFound(ApiResponse<CareerAchievementDto>.Fail(result.Error!));
    }

    [HttpPost]
    public async Task<IActionResult> Create(CareerAchievementRequest request) => Result(await achievementsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, CareerAchievementRequest request) => Result(await achievementsService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await achievementsService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    private IActionResult Result(OperationResult<CareerAchievementDto> result) =>
        result.Success
            ? Ok(ApiResponse<CareerAchievementDto>.Ok(result.Data))
            : BadRequest(ApiResponse<CareerAchievementDto>.Fail(result.Error!));
}
