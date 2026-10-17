using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Shared.Controllers;

/// <summary>Global search (the Ctrl+K palette): GET api/Shared/Search?q=passport.</summary>
[ApiController]
[Area("Shared")]
[Route("api/[area]/[controller]")]
[Authorize]
public class SearchController(ISearchService searchService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Search([FromQuery] string? q)
    {
        var result = await searchService.SearchAsync(q);
        return result.Success
            ? Ok(ApiResponse<List<SearchGroupDto>>.Ok(result.Data))
            : BadRequest(ApiResponse<List<SearchGroupDto>>.Fail(result.Error!));
    }
}
