using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Story.DTOs;
using LifeOS.Core.Story.ServiceContracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Story.Controllers;

[ApiController]
[Area("Story")]
[Route("api/[area]/[controller]")]
[Authorize]
public class LifeStoryController(ILifeStoryService lifeStoryService) : ControllerBase
{
    /// <summary>GET api/Story/LifeStory?tz=Asia/Kolkata — the whole story, filed into chapters, oldest first.</summary>
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string? tz)
    {
        var result = await lifeStoryService.GetAsync(tz);
        return result.Success
            ? Ok(ApiResponse<LifeStoryDto>.Ok(result.Data))
            : BadRequest(ApiResponse<LifeStoryDto>.Fail(result.Error!));
    }
}
