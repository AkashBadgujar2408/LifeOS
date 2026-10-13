using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Shared.Controllers;

[ApiController]
[Area("Shared")]
[Route("api/[area]/[controller]")]
public class PingController : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        return Ok(new
        {
            message = "LifeOS API is alive",
            serverTimeUtc = DateTime.UtcNow
        });
    }
}
