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
public class SkillsController(ISkillsService skillsService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(ApiResponse<List<SkillDto>>.Ok(await skillsService.GetAllAsync()));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var result = await skillsService.GetAsync(id);
        return result.Success ? Ok(ApiResponse<SkillDetailDto>.Ok(result.Data)) : NotFound(ApiResponse<SkillDetailDto>.Fail(result.Error!));
    }

    [HttpPost]
    public async Task<IActionResult> Create(SkillRequest request)
    {
        var result = await skillsService.CreateAsync(request);
        return result.Success ? Ok(ApiResponse<SkillDetailDto>.Ok(result.Data)) : BadRequest(ApiResponse<SkillDetailDto>.Fail(result.Error!));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, SkillRequest request)
    {
        var result = await skillsService.UpdateAsync(id, request);
        return result.Success ? Ok(ApiResponse<SkillDetailDto>.Ok(result.Data)) : BadRequest(ApiResponse<SkillDetailDto>.Fail(result.Error!));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await skillsService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }
}
