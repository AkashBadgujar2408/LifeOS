using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Tasks.DTOs;

namespace LifeOS.Core.Tasks.ServiceContracts;

public interface ITasksService
{
    /// <summary>Open tasks (all of them; the client buckets Today/Upcoming/Someday by its local date) or the most recently done.</summary>
    Task<List<TaskItemDto>> GetAllAsync(string status);
    Task<OperationResult<TaskItemDto>> GetAsync(int id);
    Task<OperationResult<TaskItemDto>> CreateAsync(TaskRequest request);
    Task<OperationResult<TaskItemDto>> UpdateAsync(int id, TaskRequest request);
    Task<OperationResult<SetTaskCompletedResult>> SetCompletedAsync(int id, bool completed, DateOnly today);
    Task<OperationResult<bool>> DeleteAsync(int id);

    /// <summary>Turns a captured Inbox item into a real task: creates it, moves the item's links to it, marks the item processed.</summary>
    Task<OperationResult<TaskItemDto>> CreateFromInboxAsync(int inboxItemId, TaskRequest request);
}
