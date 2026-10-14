using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Tasks.DTOs;
using LifeOS.Core.Tasks.ServiceContracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Tasks.Controllers;

[ApiController]
[Area("Tasks")]
[Route("api/[area]/[controller]")]
[Authorize]
public class ProjectsController(IProjectsService projectsService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var projects = await projectsService.GetAllAsync();
        return Ok(ApiResponse<List<ProjectDto>>.Ok(projects));
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var result = await projectsService.GetAsync(id);
        if (!result.Success)
        {
            return NotFound(ApiResponse<ProjectDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<ProjectDto>.Ok(result.Data));
    }

    [HttpPost]
    public async Task<IActionResult> Create(ProjectRequest request)
    {
        var result = await projectsService.CreateAsync(request);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<ProjectDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<ProjectDto>.Ok(result.Data));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, ProjectRequest request)
    {
        var result = await projectsService.UpdateAsync(id, request);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<ProjectDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<ProjectDto>.Ok(result.Data));
    }

    [HttpPut("{id:int}/status")]
    public async Task<IActionResult> SetStatus(int id, SetProjectStatusRequest request)
    {
        var result = await projectsService.SetStatusAsync(id, request.Status);
        if (!result.Success)
        {
            return NotFound(ApiResponse<ProjectDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<ProjectDto>.Ok(result.Data));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await projectsService.DeleteAsync(id);
        if (!result.Success)
        {
            return NotFound(ApiResponse<bool>.Fail(result.Error!));
        }

        return Ok(ApiResponse<bool>.Ok(true));
    }
}
