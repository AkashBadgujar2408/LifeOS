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
public class AchievementsController(IAchievementsService achievementsService) : ControllerBase
{
    /// <summary>GET api/Story/Achievements?tz=Asia/Kolkata — every achievement, unlocked (with the day) or not.</summary>
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string? tz)
    {
        var result = await achievementsService.GetAsync(tz);
        return result.Success
            ? Ok(ApiResponse<List<AchievementDto>>.Ok(result.Data))
            : BadRequest(ApiResponse<List<AchievementDto>>.Fail(result.Error!));
    }
}
