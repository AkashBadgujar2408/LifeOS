using LifeOS.Core.Leisure.DTOs;
using LifeOS.Core.Leisure.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Leisure.Controllers;

/// <summary>Reply shapes for Leisure's controllers: a business failure is a 400, a missing item a 404.</summary>
public abstract class LeisureControllerBase : ControllerBase
{
    protected IActionResult Result<T>(OperationResult<T> result) =>
        result.Success ? Ok(ApiResponse<T>.Ok(result.Data)) : BadRequest(ApiResponse<T>.Fail(result.Error!));

    protected IActionResult Found<T>(OperationResult<T> result) =>
        result.Success ? Ok(ApiResponse<T>.Ok(result.Data)) : NotFound(ApiResponse<T>.Fail(result.Error!));

    /// <summary>"… not found." is a 404 (another user's item, or gone); anything else a 400.</summary>
    protected IActionResult Saved<T>(OperationResult<T> result) =>
        result.Success || !result.Error!.EndsWith("not found.", StringComparison.Ordinal) ? Result(result) : Found(result);
}

[ApiController]
[Area("Leisure")]
[Route("api/[area]/[controller]")]
[Authorize]
public class MediaItemsController(IMediaItemsService mediaItemsService) : LeisureControllerBase
{
    /// <summary>GET api/Leisure/MediaItems[?kind=Book&amp;status=InProgress] — in progress, up next, wanted, finished, dropped.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? kind, [FromQuery] string? status) =>
        Ok(ApiResponse<List<MediaItemDto>>.Ok(await mediaItemsService.GetAllAsync(kind, status)));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id) => Found(await mediaItemsService.GetAsync(id));

    [HttpPost]
    public async Task<IActionResult> Create(MediaItemRequest request) => Saved(await mediaItemsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, MediaItemRequest request) => Saved(await mediaItemsService.UpdateAsync(id, request));

    /// <summary>PUT api/Leisure/MediaItems/7/progress { "currentPage": 212 } or { "season": 2, "episode": 4 }, plus "today".</summary>
    [HttpPut("{id:int}/progress")]
    public async Task<IActionResult> SetProgress(int id, MediaProgressRequest request) =>
        Saved(await mediaItemsService.SetProgressAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) => Found(await mediaItemsService.DeleteAsync(id));

    [HttpPost("{id:int}/notes")]
    public async Task<IActionResult> AddNote(int id, MediaNoteRequest request) => Saved(await mediaItemsService.AddNoteAsync(id, request));

    [HttpPut("{id:int}/notes/{noteId:int}")]
    public async Task<IActionResult> UpdateNote(int id, int noteId, MediaNoteRequest request) =>
        Saved(await mediaItemsService.UpdateNoteAsync(id, noteId, request));

    [HttpDelete("{id:int}/notes/{noteId:int}")]
    public async Task<IActionResult> DeleteNote(int id, int noteId) => Found(await mediaItemsService.DeleteNoteAsync(id, noteId));

    [HttpPost("{id:int}/logs")]
    public async Task<IActionResult> AddLog(int id, MediaLogRequest request) => Saved(await mediaItemsService.AddLogAsync(id, request));

    [HttpPut("{id:int}/logs/{logId:int}")]
    public async Task<IActionResult> UpdateLog(int id, int logId, MediaLogRequest request) =>
        Saved(await mediaItemsService.UpdateLogAsync(id, logId, request));

    [HttpDelete("{id:int}/logs/{logId:int}")]
    public async Task<IActionResult> DeleteLog(int id, int logId) => Found(await mediaItemsService.DeleteLogAsync(id, logId));
}

[ApiController]
[Area("Leisure")]
[Route("api/[area]/[controller]")]
[Authorize]
public class HobbiesController(IHobbiesService hobbiesService) : LeisureControllerBase
{
    /// <summary>GET api/Leisure/Hobbies — active first, by name, with their time so far.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(ApiResponse<List<HobbyDto>>.Ok(await hobbiesService.GetAllAsync()));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id) => Found(await hobbiesService.GetAsync(id));

    [HttpPost]
    public async Task<IActionResult> Create(HobbyRequest request) => Saved(await hobbiesService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, HobbyRequest request) => Saved(await hobbiesService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) => Found(await hobbiesService.DeleteAsync(id));

    [HttpPost("{id:int}/sessions")]
    public async Task<IActionResult> AddSession(int id, HobbySessionRequest request) =>
        Saved(await hobbiesService.AddSessionAsync(id, request));

    [HttpPut("{id:int}/sessions/{sessionId:int}")]
    public async Task<IActionResult> UpdateSession(int id, int sessionId, HobbySessionRequest request) =>
        Saved(await hobbiesService.UpdateSessionAsync(id, sessionId, request));

    [HttpDelete("{id:int}/sessions/{sessionId:int}")]
    public async Task<IActionResult> DeleteSession(int id, int sessionId) => Found(await hobbiesService.DeleteSessionAsync(id, sessionId));
}
