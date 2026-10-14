using System.ComponentModel.DataAnnotations;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Shared.Controllers;

public record TagRequest([Required, StringLength(100)] string Name);

[ApiController]
[Area("Shared")]
[Route("api/[area]/[controller]")]
[Authorize]
public class TagsController(ITagsService tagsService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var tags = await tagsService.GetAllAsync();
        return Ok(ApiResponse<List<TagDto>>.Ok(tags));
    }

    [HttpPost]
    public async Task<IActionResult> Create(TagRequest request)
    {
        var result = await tagsService.CreateAsync(request.Name);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<TagDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<TagDto>.Ok(result.Data));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Rename(int id, TagRequest request)
    {
        var result = await tagsService.RenameAsync(id, request.Name);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<TagDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<TagDto>.Ok(result.Data));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await tagsService.DeleteAsync(id);
        if (!result.Success)
        {
            return NotFound(ApiResponse<bool>.Fail(result.Error!));
        }

        return Ok(ApiResponse<bool>.Ok(true));
    }
}
