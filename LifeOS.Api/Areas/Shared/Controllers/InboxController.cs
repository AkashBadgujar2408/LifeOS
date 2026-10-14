using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Shared.Controllers;

[ApiController]
[Area("Shared")]
[Route("api/[area]/[controller]")]
[Authorize]
public class InboxController(IInboxService inboxService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? kind, [FromQuery] bool includeProcessed = false)
    {
        var items = await inboxService.GetAllAsync(kind, includeProcessed);
        return Ok(ApiResponse<List<InboxItemDto>>.Ok(items));
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateInboxItemRequest request)
    {
        var result = await inboxService.CreateAsync(request);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<InboxItemDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<InboxItemDto>.Ok(result.Data));
    }

    [HttpPut("{id:int}/processed")]
    public async Task<IActionResult> SetProcessed(int id, SetInboxItemProcessedRequest request)
    {
        var result = await inboxService.SetProcessedAsync(id, request.Processed);
        if (!result.Success)
        {
            return NotFound(ApiResponse<InboxItemDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<InboxItemDto>.Ok(result.Data));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await inboxService.DeleteAsync(id);
        if (!result.Success)
        {
            return NotFound(ApiResponse<bool>.Fail(result.Error!));
        }

        return Ok(ApiResponse<bool>.Ok(true));
    }
}
