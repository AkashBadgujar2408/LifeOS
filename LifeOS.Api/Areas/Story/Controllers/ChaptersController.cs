using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Story.DTOs;
using LifeOS.Core.Story.ServiceContracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Story.Controllers;

/// <summary>The chapters of your life: <c>api/Story/Chapters</c>.</summary>
[ApiController]
[Area("Story")]
[Route("api/[area]/[controller]")]
[Authorize]
public class ChaptersController(IChaptersService chaptersService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List() => Ok(ApiResponse<List<ChapterDto>>.Ok(await chaptersService.ListAsync()));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var result = await chaptersService.GetAsync(id);
        return result.Success
            ? Ok(ApiResponse<ChapterDto>.Ok(result.Data))
            : NotFound(ApiResponse<ChapterDto>.Fail(result.Error!));
    }

    [HttpPost]
    public async Task<IActionResult> Create(ChapterRequest request) => Saved(await chaptersService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, ChapterRequest request) => Saved(await chaptersService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await chaptersService.DeleteAsync(id);
        return result.Success
            ? Ok(ApiResponse<bool>.Ok(true))
            : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    private IActionResult Saved(OperationResult<ChapterSaveResultDto> result)
    {
        if (result.Success)
        {
            return Ok(ApiResponse<ChapterSaveResultDto>.Ok(result.Data));
        }

        var body = ApiResponse<ChapterSaveResultDto>.Fail(result.Error!);
        return result.Error == StoryErrors.ChapterNotFound ? NotFound(body) : BadRequest(body);
    }
}
