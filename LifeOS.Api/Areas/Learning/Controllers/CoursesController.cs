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
public class CoursesController(ICoursesService coursesService) : ControllerBase
{
    /// <summary>GET api/Learning/Courses[?status=InProgress] — under way first, then planned, completed, dropped.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? status) =>
        Ok(ApiResponse<List<CourseDto>>.Ok(await coursesService.GetAllAsync(status)));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var result = await coursesService.GetAsync(id);
        return result.Success ? Ok(ApiResponse<CourseDto>.Ok(result.Data)) : NotFound(ApiResponse<CourseDto>.Fail(result.Error!));
    }

    [HttpPost]
    public async Task<IActionResult> Create(CourseRequest request)
    {
        var result = await coursesService.CreateAsync(request);
        return result.Success ? Ok(ApiResponse<CourseDto>.Ok(result.Data)) : BadRequest(ApiResponse<CourseDto>.Fail(result.Error!));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, CourseRequest request)
    {
        var result = await coursesService.UpdateAsync(id, request);
        return result.Success ? Ok(ApiResponse<CourseDto>.Ok(result.Data)) : BadRequest(ApiResponse<CourseDto>.Fail(result.Error!));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await coursesService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }
}
