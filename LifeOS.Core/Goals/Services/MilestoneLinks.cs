using LifeOS.Core.Models;
using LifeOS.Core.Tasks.DTOs;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Goals.Services;

/// <summary>
/// Milestones that point at a task or a project (Session 71g) tick themselves: done when the task is done, or when
/// the project is Completed or every one of its tasks is done (a project with no tasks isn't done until it's marked
/// Completed). Pure, xUnit-tested; <see cref="MilestoneLinksService"/> applies it whenever a task or project changes.
/// </summary>
public static class MilestoneLinks
{
    public static bool TaskDone(string taskStatus) => taskStatus == TaskStatuses.Done;

    public static bool ProjectDone(string projectStatus, int taskCount, int doneTaskCount) =>
        projectStatus == ProjectStatuses.Completed || (taskCount > 0 && doneTaskCount == taskCount);
}

/// <summary>Keeps milestones that point at tasks/projects ticked (or not) to match them, and lets them go on delete.</summary>
public class MilestoneLinksService(AppDbContext db)
{
    /// <summary>
    /// Re-checks the milestones pointing at these tasks or projects (and at the projects those tasks belong to) and
    /// ticks/unticks them to match. Saves.
    /// </summary>
    public async Task SyncAsync(IReadOnlyCollection<int> taskIds, IReadOnlyCollection<int?> projectIds)
    {
        var projects = projectIds.Where(p => p is not null).Select(p => p!.Value).ToHashSet();
        if (taskIds.Count > 0)
        {
            projects.UnionWith(await db.TaskItems
                .Where(t => taskIds.Contains(t.Id) && t.ProjectId != null)
                .Select(t => t.ProjectId!.Value)
                .ToListAsync());
        }

        var milestones = await db.GoalMilestones
            .Where(m => (m.TaskItemId != null && taskIds.Contains(m.TaskItemId.Value))
                || (m.ProjectId != null && projects.Contains(m.ProjectId.Value)))
            .ToListAsync();
        if (milestones.Count == 0)
        {
            return;
        }

        await ApplyAsync(milestones);
        await db.SaveChangesAsync();
    }

    /// <summary>
    /// Brings tracked milestones in line with what they point at (no save) — also used when a milestone is created or
    /// re-pointed. Milestones pointing at nothing are left alone.
    /// </summary>
    public async Task ApplyAsync(IReadOnlyCollection<GoalMilestone> milestones)
    {
        var taskIds = milestones.Where(m => m.TaskItemId is not null).Select(m => m.TaskItemId!.Value).Distinct().ToList();
        var projectIds = milestones.Where(m => m.ProjectId is not null).Select(m => m.ProjectId!.Value).Distinct().ToList();
        var tasks = taskIds.Count == 0 ? [] : await db.TaskItems
            .Where(t => taskIds.Contains(t.Id))
            .ToDictionaryAsync(t => t.Id, t => t.Status);
        var projects = projectIds.Count == 0 ? [] : await db.Projects
            .Where(p => projectIds.Contains(p.Id))
            .Select(p => new { p.Id, p.Status, Tasks = p.TaskItems.Count, Done = p.TaskItems.Count(t => t.Status == TaskStatuses.Done) })
            .ToDictionaryAsync(p => p.Id);

        var now = DateTime.UtcNow;
        foreach (var milestone in milestones)
        {
            bool done;
            if (milestone.TaskItemId is { } taskId && tasks.TryGetValue(taskId, out var status))
            {
                done = MilestoneLinks.TaskDone(status);
            }
            else if (milestone.ProjectId is { } projectId && projects.TryGetValue(projectId, out var p))
            {
                done = MilestoneLinks.ProjectDone(p.Status, p.Tasks, p.Done);
            }
            else
            {
                continue;
            }

            if (done && milestone.CompletedAt is null)
            {
                milestone.CompletedAt = now;
                milestone.UpdatedAt = now;
            }
            else if (!done && milestone.CompletedAt is not null)
            {
                milestone.CompletedAt = null;
                milestone.UpdatedAt = now;
            }
        }
    }

    /// <summary>A task or project is being deleted: its milestones stop pointing at it and keep their tick. No save.</summary>
    public async Task ReleaseAsync(int? taskId, int? projectId)
    {
        var now = DateTime.UtcNow;
        if (taskId is { } t)
        {
            await db.GoalMilestones.Where(m => m.TaskItemId == t)
                .ExecuteUpdateAsync(s => s.SetProperty(m => m.TaskItemId, (int?)null).SetProperty(m => m.UpdatedAt, now));
        }

        if (projectId is { } p)
        {
            await db.GoalMilestones.Where(m => m.ProjectId == p)
                .ExecuteUpdateAsync(s => s.SetProperty(m => m.ProjectId, (int?)null).SetProperty(m => m.UpdatedAt, now));
        }
    }
}
