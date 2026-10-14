using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Shared.Controllers;

[ApiController]
[Area("Shared")]
[Route("api/[area]/[controller]")]
[Authorize]
public class EntityLinksController(IEntityLinksService entityLinksService) : ControllerBase
{
    [HttpGet("types")]
    public IActionResult GetTypes()
    {
        return Ok(ApiResponse<List<LinkableTypeDto>>.Ok(entityLinksService.GetLinkableTypes()));
    }

    [HttpGet]
    public async Task<IActionResult> GetLinks([FromQuery] string entityType, [FromQuery] int entityId)
    {
        var result = await entityLinksService.GetLinksAsync(entityType, entityId);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<List<LinkedItemDto>>.Fail(result.Error!));
        }

        return Ok(ApiResponse<List<LinkedItemDto>>.Ok(result.Data));
    }

    [HttpGet("candidates")]
    public async Task<IActionResult> SearchCandidates(
        [FromQuery] string entityType,
        [FromQuery] string? search,
        [FromQuery] string? excludeEntityType,
        [FromQuery] int? excludeEntityId)
    {
        var result = await entityLinksService.SearchCandidatesAsync(entityType, search, excludeEntityType, excludeEntityId);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<List<LinkableItemDto>>.Fail(result.Error!));
        }

        return Ok(ApiResponse<List<LinkableItemDto>>.Ok(result.Data));
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateEntityLinkRequest request)
    {
        var result = await entityLinksService.CreateAsync(request);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<LinkedItemDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<LinkedItemDto>.Ok(result.Data));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await entityLinksService.DeleteAsync(id);
        if (!result.Success)
        {
            return NotFound(ApiResponse<bool>.Fail(result.Error!));
        }

        return Ok(ApiResponse<bool>.Ok(true));
    }
}
