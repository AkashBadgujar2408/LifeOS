using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Goals.Services;
using LifeOS.Core.Models;
using LifeOS.Core.Tasks.DTOs;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Tasks.Services;

/// <summary>
/// Projects counting toward goals (Session 71g): tasks done in a project ("Ship the app: 40 tasks") and hours of focus
/// on its tasks ("100 hours on the thesis"). Task completions and focus sessions are moments (UTC) and the server
/// doesn't know the user's zone, so they're counted on their UTC day — a task done just after local midnight east of
/// UTC can land on the day before. A reopened task stops counting; a deleted one goes with its focus time.
/// </summary>
public class TaskGoalSources(AppDbContext db) : IGoalProgressSource
{
    public const string TasksUnit = "tasks";
    public const string HoursUnit = "hours";

    public IReadOnlyCollection<string> Kinds { get; } = [GoalSourceKinds.ProjectTasks, GoalSourceKinds.ProjectFocus];

    public async Task<Dictionary<int, SourceDescription>> DescribeAsync(IReadOnlyCollection<GoalSourceRef> sources)
    {
        var names = await NamesAsync(sources);
        return sources
            .Where(s => s.EntityId is { } id && names.ContainsKey(id))
            .ToDictionary(s => s.Id, s => s.Kind == GoalSourceKinds.ProjectTasks
                ? new SourceDescription($"Tasks done: {names[s.EntityId!.Value]}", TasksUnit)
                : new SourceDescription($"Focus time: {names[s.EntityId!.Value]}", HoursUnit));
    }

    public async Task<List<SourceAmount>> AmountsAsync(IReadOnlyCollection<GoalSourceRef> sources, DateOnly today)
    {
        var amounts = new List<SourceAmount>();
        var end = today.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        foreach (var source in sources.Where(s => s.EntityId is not null))
        {
            var start = source.CountsFrom.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            if (source.Kind == GoalSourceKinds.ProjectTasks)
            {
                var done = await db.TaskItems
                    .Where(t => t.ProjectId == source.EntityId && t.Status == TaskStatuses.Done
                        && t.CompletedAt >= start && t.CompletedAt < end)
                    .Select(t => t.CompletedAt!.Value)
                    .ToListAsync();
                amounts.AddRange(done.GroupBy(DateOnly.FromDateTime).Select(g => new SourceAmount(source.Id, g.Key, g.Count())));
            }
            else
            {
                var focus = await db.FocusSessions
                    .Where(f => f.TaskItem.ProjectId == source.EntityId && f.EndedAt >= start && f.EndedAt < end)
                    .Select(f => new { f.EndedAt, f.Minutes })
                    .ToListAsync();
                amounts.AddRange(focus
                    .GroupBy(f => DateOnly.FromDateTime(f.EndedAt))
                    .Select(g => new SourceAmount(source.Id, g.Key, Math.Round(g.Sum(f => f.Minutes) / 60m, 2, MidpointRounding.AwayFromZero))));
            }
        }

        return amounts;
    }

    public async Task<List<GoalSourceOptionDto>> OptionsAsync()
    {
        var projects = await db.Projects
            .Where(p => p.Status != ProjectStatuses.Archived)
            .OrderBy(p => p.Name)
            .Select(p => new { p.Id, p.Name })
            .ToListAsync();
        return projects
            .SelectMany(p => new[]
            {
                new GoalSourceOptionDto
                {
                    Kind = GoalSourceKinds.ProjectTasks, EntityType = ProjectLinkableProvider.Type, EntityId = p.Id,
                    Title = $"Tasks done: {p.Name}", Unit = TasksUnit,
                },
                new GoalSourceOptionDto
                {
                    Kind = GoalSourceKinds.ProjectFocus, EntityType = ProjectLinkableProvider.Type, EntityId = p.Id,
                    Title = $"Focus time: {p.Name}", Unit = HoursUnit,
                },
            })
            .OrderBy(o => o.Kind).ThenBy(o => o.Title)
            .ToList();
    }

    private async Task<Dictionary<int, string>> NamesAsync(IReadOnlyCollection<GoalSourceRef> sources)
    {
        var ids = sources.Where(s => s.EntityId is not null).Select(s => s.EntityId!.Value).Distinct().ToList();
        return ids.Count == 0
            ? []
            : await db.Projects.Where(p => ids.Contains(p.Id)).ToDictionaryAsync(p => p.Id, p => p.Name);
    }
}
