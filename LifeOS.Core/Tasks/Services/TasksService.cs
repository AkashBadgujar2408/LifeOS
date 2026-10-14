using AutoMapper;
using AutoMapper.QueryableExtensions;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using LifeOS.Core.Tasks.DTOs;
using LifeOS.Core.Tasks.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Tasks.Services;

public class TasksService(AppDbContext db, IMapper mapper, IEntityLinksService entityLinksService) : ITasksService
{
    private const string NotFound = "Task not found.";
    private const int DoneListLimit = 100;

    public async Task<List<TaskItemDto>> GetAllAsync(string status, int? projectId = null)
    {
        var query = db.TaskItems.Where(t => t.Status == status);
        if (projectId is not null)
        {
            query = query.Where(t => t.ProjectId == projectId);
        }

        query = status == TaskStatuses.Done
            ? query.OrderByDescending(t => t.CompletedAt).Take(DoneListLimit)
            : query.OrderBy(t => t.DueDate == null).ThenBy(t => t.DueDate).ThenBy(t => t.CreatedAt);

        return await query.ProjectTo<TaskItemDto>(mapper.ConfigurationProvider).ToListAsync();
    }

    public async Task<OperationResult<TaskItemDto>> GetAsync(int id)
    {
        var task = await db.TaskItems
            .Where(t => t.Id == id)
            .ProjectTo<TaskItemDto>(mapper.ConfigurationProvider)
            .FirstOrDefaultAsync();

        return task is null ? OperationResult<TaskItemDto>.Fail(NotFound) : OperationResult<TaskItemDto>.Ok(task);
    }

    public async Task<OperationResult<TaskItemDto>> CreateAsync(TaskRequest request)
    {
        var error = await ValidateAsync(request);
        if (error is not null)
        {
            return OperationResult<TaskItemDto>.Fail(error);
        }

        var task = NewTask(request);
        db.TaskItems.Add(task);
        await db.SaveChangesAsync();

        return await GetAsync(task.Id);
    }

    public async Task<OperationResult<TaskItemDto>> UpdateAsync(int id, TaskRequest request)
    {
        var task = await db.TaskItems.FindAsync(id);
        if (task is null)
        {
            return OperationResult<TaskItemDto>.Fail(NotFound);
        }

        var error = await ValidateAsync(request, task.ProjectId);
        if (error is not null)
        {
            return OperationResult<TaskItemDto>.Fail(error);
        }

        // Re-anchor the series when the schedule itself changes (new rule, or the due date was moved): the edited
        // due date becomes occurrence zero. Unchanged rule + date keeps the original anchor (no month-end drift).
        var recurrence = request.Recurrence;
        var scheduleChanged = recurrence is not null && (
            task.RecurrenceFrequency != recurrence.Frequency ||
            task.RecurrenceInterval != recurrence.Interval ||
            task.DueDate != request.DueDate);

        task.Title = request.Title.Trim();
        task.Notes = NormalizeText(request.Notes);
        task.DueDate = request.DueDate;
        task.Priority = request.Priority;
        task.ProjectId = request.ProjectId;
        task.RecurrenceFrequency = recurrence?.Frequency;
        task.RecurrenceInterval = recurrence?.Interval;
        task.RecurrenceAnchorDate = recurrence is null ? null : scheduleChanged ? request.DueDate : task.RecurrenceAnchorDate;
        task.UpdatedAt = DateTime.UtcNow;

        var wanted = request.TagIds.Distinct().ToHashSet();
        var current = await db.TaskTags.Where(tt => tt.TaskItemId == id).ToListAsync();
        foreach (var taskTag in current.Where(tt => !wanted.Contains(tt.TagId)))
        {
            taskTag.IsDeleted = true;
            taskTag.DeletedAt = DateTime.UtcNow;
        }

        foreach (var tagId in wanted.Except(current.Select(tt => tt.TagId)))
        {
            db.TaskTags.Add(new TaskTag { UserId = task.UserId, TaskItemId = id, TagId = tagId });
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<TaskItemDto>.Fail("This task was changed somewhere else at the same time. Reload and try again.");
        }

        return await GetAsync(id);
    }

    public async Task<OperationResult<SetTaskCompletedResult>> SetCompletedAsync(int id, bool completed, DateOnly today)
    {
        var task = await db.TaskItems.FindAsync(id);
        if (task is null)
        {
            return OperationResult<SetTaskCompletedResult>.Fail(NotFound);
        }

        if (!completed)
        {
            // Reopening keeps any next occurrence already spawned; NextOccurrenceTaskId stops a second one.
            task.Status = TaskStatuses.Open;
            task.CompletedAt = null;
            task.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return OperationResult<SetTaskCompletedResult>.Ok(new SetTaskCompletedResult { Task = (await GetAsync(id)).Data! });
        }

        await using var transaction = await db.Database.BeginTransactionAsync();

        task.Status = TaskStatuses.Done;
        task.CompletedAt ??= DateTime.UtcNow;
        task.UpdatedAt = DateTime.UtcNow;

        TaskItem? next = null;
        if (task.RecurrenceFrequency is not null && task.NextOccurrenceTaskId is null)
        {
            next = new TaskItem
            {
                UserId = task.UserId,
                ProjectId = task.ProjectId,
                Title = task.Title,
                Notes = task.Notes,
                Priority = task.Priority,
                Status = TaskStatuses.Open,
                DueDate = TaskRecurrence.NextDueDate(
                    task.RecurrenceFrequency, task.RecurrenceInterval!.Value, task.RecurrenceAnchorDate!.Value, task.DueDate!.Value, today),
                RecurrenceFrequency = task.RecurrenceFrequency,
                RecurrenceInterval = task.RecurrenceInterval,
                RecurrenceAnchorDate = task.RecurrenceAnchorDate,
            };
            var tagIds = await db.TaskTags.Where(tt => tt.TaskItemId == id).Select(tt => tt.TagId).ToListAsync();
            foreach (var tagId in tagIds)
            {
                next.TaskTags.Add(new TaskTag { UserId = task.UserId, TagId = tagId });
            }

            db.TaskItems.Add(next);
            await db.SaveChangesAsync();
            task.NextOccurrenceTaskId = next.Id;
        }

        await db.SaveChangesAsync();
        await transaction.CommitAsync();

        return OperationResult<SetTaskCompletedResult>.Ok(new SetTaskCompletedResult
        {
            Task = (await GetAsync(id)).Data!,
            NextOccurrence = next is null ? null : (await GetAsync(next.Id)).Data,
        });
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var task = await db.TaskItems.FindAsync(id);
        if (task is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();

        await db.TaskTags
            .Where(tt => tt.TaskItemId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(tt => tt.IsDeleted, true).SetProperty(tt => tt.DeletedAt, now));

        task.IsDeleted = true;
        task.DeletedAt = now;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(TaskLinkableProvider.Type, id);

        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task<OperationResult<TaskItemDto>> CreateFromInboxAsync(int inboxItemId, TaskRequest request)
    {
        var inboxItem = await db.InboxItems.FindAsync(inboxItemId);
        if (inboxItem is null)
        {
            return OperationResult<TaskItemDto>.Fail("Inbox item not found.");
        }

        if (inboxItem.ProcessedAt is not null)
        {
            return OperationResult<TaskItemDto>.Fail("This inbox item has already been processed.");
        }

        var error = await ValidateAsync(request);
        if (error is not null)
        {
            return OperationResult<TaskItemDto>.Fail(error);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();

        var task = NewTask(request);
        db.TaskItems.Add(task);
        inboxItem.ProcessedAt = DateTime.UtcNow;
        inboxItem.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        // Whatever the captured thought was linked to (a goal, another note) moves to the real task: copy, then drop
        // the inbox item's own links so the goal doesn't list the same thing twice (processed item + task).
        await entityLinksService.CopyLinksAsync(InboxLinkableProvider.Type, inboxItemId, TaskLinkableProvider.Type, task.Id);
        await entityLinksService.RemoveAllForEntityAsync(InboxLinkableProvider.Type, inboxItemId);

        await transaction.CommitAsync();
        return await GetAsync(task.Id);
    }

    private TaskItem NewTask(TaskRequest request)
    {
        var userId = db.CurrentUserId!.Value;
        var task = new TaskItem
        {
            UserId = userId,
            Title = request.Title.Trim(),
            Notes = NormalizeText(request.Notes),
            DueDate = request.DueDate,
            Priority = request.Priority,
            Status = TaskStatuses.Open,
            ProjectId = request.ProjectId,
            RecurrenceFrequency = request.Recurrence?.Frequency,
            RecurrenceInterval = request.Recurrence?.Interval,
            RecurrenceAnchorDate = request.Recurrence is null ? null : request.DueDate,
        };
        foreach (var tagId in request.TagIds.Distinct())
        {
            task.TaskTags.Add(new TaskTag { UserId = userId, TagId = tagId });
        }

        return task;
    }

    /// <param name="currentProjectId">The task's project before an edit: it may stay even if it's no longer active.</param>
    private async Task<string?> ValidateAsync(TaskRequest request, int? currentProjectId = null)
    {
        if (request.Title.Trim().Length == 0)
        {
            return "Title is required.";
        }

        // Mirrors CK_TaskItems_Recurrence so the user gets a clean message rather than a constraint error.
        if (request.Recurrence is not null && request.DueDate is null)
        {
            return "A repeating task needs a due date to repeat from.";
        }

        // Only active projects take new tasks; a task already in a completed/archived project can keep it.
        if (request.ProjectId is not null && request.ProjectId != currentProjectId)
        {
            var projectStatus = await db.Projects
                .Where(p => p.Id == request.ProjectId)
                .Select(p => p.Status)
                .FirstOrDefaultAsync();
            if (projectStatus is null)
            {
                return "Project not found.";
            }

            if (projectStatus != ProjectStatuses.Active)
            {
                return $"That project is {projectStatus.ToLowerInvariant()}. Reopen it to add tasks.";
            }
        }

        // Tags go through the per-user filter, so another user's tag id counts as missing.
        var tagIds = request.TagIds.Distinct().ToList();
        if (tagIds.Count > 0 && await db.Tags.CountAsync(t => tagIds.Contains(t.Id)) != tagIds.Count)
        {
            return "Tag not found.";
        }

        return null;
    }

    private static string? NormalizeText(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();
}
