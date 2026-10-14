using LifeOS.Core.Calendar.DTOs;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace LifeOS.Api.Areas.Calendar.Controllers;

[ApiController]
[Area("Calendar")]
[Route("api/[area]/[controller]")]
[Authorize]
public class FeedController(ICalendarFeedService calendarFeedService) : ControllerBase
{
    /// <summary>
    /// GET api/Calendar/Feed?from=2026-10-01&amp;to=2026-10-31&amp;fromUtc=2026-09-30T18:30:00Z&amp;toUtc=2026-10-31T18:30:00Z
    /// </summary>
    /// <remarks>
    /// fromUtc/toUtc must carry a "Z" (or an offset): without one, model binding reads them as the server's local time.
    /// </remarks>
    [HttpGet]
    public async Task<IActionResult> Get(
        [FromQuery, BindRequired] DateOnly from,
        [FromQuery, BindRequired] DateOnly to,
        [FromQuery] DateTime? fromUtc,
        [FromQuery] DateTime? toUtc)
    {
        var result = await calendarFeedService.GetFeedAsync(from, to, fromUtc, toUtc);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<List<CalendarFeedItemDto>>.Fail(result.Error!));
        }

        return Ok(ApiResponse<List<CalendarFeedItemDto>>.Ok(result.Data));
    }
}
