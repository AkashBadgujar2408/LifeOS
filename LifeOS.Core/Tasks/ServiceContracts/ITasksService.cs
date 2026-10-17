using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Tasks.DTOs;

namespace LifeOS.Core.Tasks.ServiceContracts;

public interface ITasksService
{
    /// <summary>
    /// Open tasks (all of them; the client buckets Today/Upcoming/Someday by its local date) or the most recently done,
    /// optionally only those in one project.
    /// </summary>
    Task<List<TaskItemDto>> GetAllAsync(string status, int? projectId = null);
    Task<OperationResult<TaskItemDto>> GetAsync(int id);
    Task<OperationResult<TaskItemDto>> CreateAsync(TaskRequest request);
    Task<OperationResult<TaskItemDto>> UpdateAsync(int id, TaskRequest request);
    Task<OperationResult<SetTaskCompletedResult>> SetCompletedAsync(int id, bool completed, DateOnly today);
    Task<OperationResult<bool>> DeleteAsync(int id);

    /// <summary>The task's focus sessions, newest first.</summary>
    Task<OperationResult<List<FocusSessionDto>>> GetFocusSessionsAsync(int id);

    /// <summary>Logs a focus session; returns the task with its new actual time.</summary>
    Task<OperationResult<TaskItemDto>> AddFocusSessionAsync(int id, FocusSessionRequest request);

    Task<OperationResult<TaskItemDto>> RemoveFocusSessionAsync(int id, int sessionId);

    /// <summary>Turns a captured Inbox item into a real task: creates it, moves the item's links to it, marks the item processed.</summary>
    Task<OperationResult<TaskItemDto>> CreateFromInboxAsync(int inboxItemId, TaskRequest request);
}
