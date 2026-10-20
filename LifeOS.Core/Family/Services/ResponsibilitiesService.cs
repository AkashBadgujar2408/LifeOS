using LifeOS.Core.Family.DTOs;
using LifeOS.Core.Family.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Family.Services;

/// <summary>
/// Who looks after what in the family (Session 74): yours, shared, or someone else's (tracked, not yours to do), for
/// a person or the household. A responsibility may be kept going by a task — usually a repeating one, which spawns
/// its next occurrence when ticked, so the task shown is always the latest in that chain.
/// </summary>
public class ResponsibilitiesService(AppDbContext db) : IResponsibilitiesService
{
    private const string NotFound = "Responsibility not found.";
    private const int MaxChain = 100;

    public async Task<List<ResponsibilityDto>> GetAllAsync(int? contactId)
    {
        var query = db.Responsibilities.AsQueryable();
        if (contactId is { } id)
        {
            query = query.Where(r => r.ContactId == id || r.HolderContactId == id);
        }

        var rows = await query
            // Current ones first, then the ones that ended (most recent first); A–Z inside.
            .OrderBy(r => r.EndedOn != null).ThenByDescending(r => r.EndedOn).ThenBy(r => r.Title)
            .Select(r => new
            {
                r.Id, r.Title, r.ContactId, r.HeldBy, r.HolderContactId, r.TaskItemId, r.StartedOn, r.EndedOn, r.Notes,
                ContactName = r.Contact != null && !r.Contact.IsDeleted ? r.Contact.Name : null,
                HolderName = r.HolderContact != null && !r.HolderContact.IsDeleted ? r.HolderContact.Name : null,
            })
            .ToListAsync();

        var tasks = await LatestTasksAsync(rows.Where(r => r.TaskItemId is not null).Select(r => r.TaskItemId!.Value).Distinct().ToList());
        return rows.Select(r =>
        {
            var task = r.TaskItemId is { } taskId ? tasks.GetValueOrDefault(taskId) : null;
            return new ResponsibilityDto
            {
                Id = r.Id,
                Title = r.Title,
                ContactId = r.ContactName is null ? null : r.ContactId,
                ContactName = r.ContactName,
                HeldBy = r.HeldBy,
                HolderContactId = r.HolderName is null ? null : r.HolderContactId,
                HolderName = r.HolderName,
                TaskItemId = task?.Id,
                TaskTitle = task?.Title,
                TaskDueDate = task?.DueDate,
                TaskDone = task?.Done ?? false,
                StartedOn = r.StartedOn,
                EndedOn = r.EndedOn,
                Notes = r.Notes,
            };
        }).ToList();
    }

    public async Task<OperationResult<ResponsibilityDto>> CreateAsync(ResponsibilityRequest request)
    {
        var responsibility = new Responsibility { UserId = db.CurrentUserId!.Value };
        if (await ApplyAsync(responsibility, request) is { } error)
        {
            return OperationResult<ResponsibilityDto>.Fail(error);
        }

        db.Responsibilities.Add(responsibility);
        await db.SaveChangesAsync();
        return OperationResult<ResponsibilityDto>.Ok(await GetOneAsync(responsibility.Id));
    }

    public async Task<OperationResult<ResponsibilityDto>> UpdateAsync(int id, ResponsibilityRequest request)
    {
        var responsibility = await db.Responsibilities.FindAsync(id);
        if (responsibility is null)
        {
            return OperationResult<ResponsibilityDto>.Fail(NotFound);
        }

        if (await ApplyAsync(responsibility, request) is { } error)
        {
            return OperationResult<ResponsibilityDto>.Fail(error);
        }

        responsibility.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<ResponsibilityDto>.Ok(await GetOneAsync(id));
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var responsibility = await db.Responsibilities.FindAsync(id);
        if (responsibility is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        // Its task stays: it's an ordinary task in Tasks too.
        responsibility.IsDeleted = true;
        responsibility.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<string?> ApplyAsync(Responsibility responsibility, ResponsibilityRequest request)
    {
        var title = request.Title?.Trim() ?? string.Empty;
        var holder = request.HeldBy == ResponsibilityHolders.Me ? null : request.HolderContactId;
        if (FamilyLogRules.CheckResponsibility(title, request.HeldBy, request.HolderContactId, request.StartedOn, request.EndedOn) is { } error)
        {
            return error;
        }

        var people = new[] { request.ContactId, holder }.Where(c => c is not null).Select(c => c!.Value).Distinct().ToList();
        if (await db.Contacts.CountAsync(c => people.Contains(c.Id)) != people.Count)
        {
            return "Contact not found.";
        }

        if (request.TaskItemId is { } taskId && !await db.TaskItems.AnyAsync(t => t.Id == taskId))
        {
            return "Task not found.";
        }

        responsibility.Title = title;
        responsibility.ContactId = request.ContactId;
        responsibility.HeldBy = request.HeldBy;
        responsibility.HolderContactId = holder;
        responsibility.TaskItemId = request.TaskItemId;
        responsibility.StartedOn = request.StartedOn;
        responsibility.EndedOn = request.EndedOn;
        responsibility.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        return null;
    }

    /// <summary>For each task, the latest occurrence it led to (a repeating task's next one, and so on).</summary>
    private async Task<Dictionary<int, TaskInfo>> LatestTasksAsync(List<int> taskIds)
    {
        var known = new Dictionary<int, TaskInfo>();
        var wanted = taskIds.ToList();
        for (var step = 0; step < MaxChain && wanted.Count > 0; step++)
        {
            var rows = await db.TaskItems.Where(t => wanted.Contains(t.Id))
                .Select(t => new TaskInfo(t.Id, t.Title, t.DueDate, t.Status == "Done", t.NextOccurrenceTaskId))
                .ToListAsync();
            foreach (var row in rows)
            {
                known[row.Id] = row;
            }

            wanted = rows.Where(r => r.NextId is { } next && !known.ContainsKey(next)).Select(r => r.NextId!.Value).ToList();
        }

        var latest = new Dictionary<int, TaskInfo>();
        foreach (var id in taskIds.Where(known.ContainsKey))
        {
            var current = known[id];
            for (var step = 0; step < MaxChain && current.NextId is { } next && known.TryGetValue(next, out var after); step++)
            {
                current = after;
            }

            latest[id] = current;
        }

        return latest;
    }

    private async Task<ResponsibilityDto> GetOneAsync(int id) => (await GetAllAsync(null)).Single(r => r.Id == id);

    private sealed record TaskInfo(int Id, string Title, DateOnly? DueDate, bool Done, int? NextId);
}
