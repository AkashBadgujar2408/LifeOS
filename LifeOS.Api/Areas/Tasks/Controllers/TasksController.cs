using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Tasks.DTOs;
using LifeOS.Core.Tasks.ServiceContracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Tasks.Controllers;

[ApiController]
[Area("Tasks")]
[Route("api/[area]/[controller]")]
[Authorize]
public class TasksController(ITasksService tasksService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string status = TaskStatuses.Open, [FromQuery] int? projectId = null)
    {
        if (status is not (TaskStatuses.Open or TaskStatuses.Done))
        {
            return BadRequest(ApiResponse<List<TaskItemDto>>.Fail("Status must be Open or Done."));
        }

        var tasks = await tasksService.GetAllAsync(status, projectId);
        return Ok(ApiResponse<List<TaskItemDto>>.Ok(tasks));
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var result = await tasksService.GetAsync(id);
        if (!result.Success)
        {
            return NotFound(ApiResponse<TaskItemDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<TaskItemDto>.Ok(result.Data));
    }

    [HttpPost]
    public async Task<IActionResult> Create(TaskRequest request)
    {
        var result = await tasksService.CreateAsync(request);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<TaskItemDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<TaskItemDto>.Ok(result.Data));
    }

    [HttpPost("from-inbox/{inboxItemId:int}")]
    public async Task<IActionResult> CreateFromInbox(int inboxItemId, TaskRequest request)
    {
        var result = await tasksService.CreateFromInboxAsync(inboxItemId, request);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<TaskItemDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<TaskItemDto>.Ok(result.Data));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, TaskRequest request)
    {
        var result = await tasksService.UpdateAsync(id, request);
        if (!result.Success)
        {
            return BadRequest(ApiResponse<TaskItemDto>.Fail(result.Error!));
        }

        return Ok(ApiResponse<TaskItemDto>.Ok(result.Data));
    }

    [HttpPut("{id:int}/completed")]
    public async Task<IActionResult> SetCompleted(int id, SetTaskCompletedRequest request)
    {
        var today = request.Today ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var result = await tasksService.SetCompletedAsync(id, request.Completed, today);
        if (!result.Success)
        {
            return NotFound(ApiResponse<SetTaskCompletedResult>.Fail(result.Error!));
        }

        return Ok(ApiResponse<SetTaskCompletedResult>.Ok(result.Data));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await tasksService.DeleteAsync(id);
        if (!result.Success)
        {
            return NotFound(ApiResponse<bool>.Fail(result.Error!));
        }

        return Ok(ApiResponse<bool>.Ok(true));
    }
}
