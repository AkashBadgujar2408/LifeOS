using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Goals.Services;
using LifeOS.Core.Habits.DTOs;
using LifeOS.Core.Models;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Habits.Services;

/// <summary>
/// Habits counting toward goals (Session 71e). A measurable habit ("8,000 steps") adds what was logged each day — all
/// of it, even a 5,000 day short of its target (those steps were still walked); a day ticked without a figure counts
/// as the habit's target. A plain habit adds 1 per day done, in "days". Avoid habits record slips, so they never count.
/// </summary>
public class HabitGoalSource(AppDbContext db) : IGoalProgressSource
{
    public const string DaysUnit = "days";

    public IReadOnlyCollection<string> Kinds { get; } = [GoalSourceKinds.Habit];

    public async Task<Dictionary<int, SourceDescription>> DescribeAsync(IReadOnlyCollection<GoalSourceRef> sources)
    {
        var habits = await LoadAsync(sources);
        return sources
            .Where(s => s.EntityId is { } id && habits.ContainsKey(id))
            .ToDictionary(s => s.Id, s =>
            {
                var habit = habits[s.EntityId!.Value];
                return new SourceDescription(habit.Title, UnitOf(habit.TargetValue, habit.Unit));
            });
    }

    public async Task<List<SourceAmount>> AmountsAsync(IReadOnlyCollection<GoalSourceRef> sources, DateOnly today)
    {
        var habits = await LoadAsync(sources);
        var ids = habits.Keys.ToList();
        if (ids.Count == 0)
        {
            return [];
        }

        var earliest = sources.Min(s => s.CountsFrom);
        var entries = await db.HabitEntries
            .Where(e => ids.Contains(e.HabitId) && e.EntryDate >= earliest && e.EntryDate <= today)
            .Select(e => new { e.HabitId, e.EntryDate, e.Value })
            .ToListAsync();

        var amounts = new List<SourceAmount>();
        foreach (var source in sources)
        {
            if (source.EntityId is not { } habitId || !habits.TryGetValue(habitId, out var habit) || habit.Kind != HabitKinds.Build)
            {
                continue;
            }

            amounts.AddRange(entries
                .Where(e => e.HabitId == habitId && e.EntryDate >= source.CountsFrom)
                .Select(e => new SourceAmount(source.Id, e.EntryDate, Amount(habit.TargetValue, e.Value)))
                .Where(a => a.Amount > 0));
        }

        return amounts;
    }

    public async Task<List<GoalSourceOptionDto>> OptionsAsync() =>
        (await db.Habits
            .Where(h => h.Kind == HabitKinds.Build && h.Status == HabitStatuses.Active)
            .OrderBy(h => h.Title)
            .Select(h => new { h.Id, h.Title, h.TargetValue, h.Unit })
            .ToListAsync())
        .Select(h => new GoalSourceOptionDto
        {
            Kind = GoalSourceKinds.Habit,
            EntityType = HabitLinkableProvider.Type,
            EntityId = h.Id,
            Title = h.Title,
            Unit = UnitOf(h.TargetValue, h.Unit),
        })
        .ToList();

    public async Task<string?> CheckAsync(GoalSourceRef source)
    {
        var kind = await db.Habits.Where(h => h.Id == source.EntityId).Select(h => h.Kind).FirstOrDefaultAsync();
        return kind == HabitKinds.Avoid
            ? "An avoid habit records slips, not progress, so it can't count toward a goal."
            : null;
    }

    /// <summary>A measurable habit counts in its own unit; a plain one in days.</summary>
    internal static string UnitOf(decimal? targetValue, string? unit) =>
        targetValue is not null && !string.IsNullOrWhiteSpace(unit) ? unit.Trim() : DaysUnit;

    /// <summary>What one day adds: the logged figure, the target when the day was ticked without one, else 1 day.</summary>
    internal static decimal Amount(decimal? targetValue, decimal? value) =>
        targetValue is null ? 1 : value ?? targetValue.Value;

    private async Task<Dictionary<int, HabitInfo>> LoadAsync(IReadOnlyCollection<GoalSourceRef> sources)
    {
        var ids = sources.Where(s => s.EntityId is not null).Select(s => s.EntityId!.Value).Distinct().ToList();
        return ids.Count == 0
            ? []
            : await db.Habits
                .Where(h => ids.Contains(h.Id))
                .Select(h => new HabitInfo(h.Id, h.Title, h.Kind, h.TargetValue, h.Unit))
                .ToDictionaryAsync(h => h.Id);
    }

    private sealed record HabitInfo(int Id, string Title, string Kind, decimal? TargetValue, string? Unit);
}
