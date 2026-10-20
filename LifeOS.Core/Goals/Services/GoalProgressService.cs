using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Health.Services;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace LifeOS.Core.Goals.Services;

/// <summary>
/// Feeds <see cref="GoalProgress.Of"/> for any number of goals: measure (already done + logged entries + what its
/// sources counted), savings (one net-worth picture for all of them), body targets (only with the vault unlocked).
/// Every screen that shows a goal's % goes through here, so the figure is the same everywhere.
/// </summary>
public class GoalProgressService(AppDbContext db, IWealthService wealthService, GoalSourceReader sourceReader,
    IServiceProvider services) : IGoalProgressService
{
    public async Task<Dictionary<int, GoalProgressDto>> ForGoalsAsync(IReadOnlyCollection<GoalProgressInput> goals, DateOnly today)
    {
        if (goals.Count == 0)
        {
            return [];
        }

        var ids = goals.Select(g => g.Id).Distinct().ToList();
        var targets = await db.Goals
            .Where(g => ids.Contains(g.Id))
            .Select(g => new { g.Id, g.MeasureTarget, g.MeasureStart, HasAmount = g.TargetAmount != null })
            .ToDictionaryAsync(g => g.Id);

        var measuredIds = targets.Values.Where(t => t.MeasureTarget is not null).Select(t => t.Id).ToList();
        var counted = await CountedAsync(measuredIds, today);

        var savingsIds = targets.Values.Where(t => t.HasAmount).Select(t => t.Id).ToList();
        var savings = savingsIds.Count == 0 ? [] : await wealthService.GetSavingsForGoalsAsync(savingsIds, today);

        var bodyCandidates = targets.Values.Where(t => t.MeasureTarget is null && !t.HasAmount).Select(t => t.Id).ToList();
        var body = await BodyPercentsAsync(bodyCandidates);

        var result = new Dictionary<int, GoalProgressDto>();
        foreach (var goal in goals)
        {
            var target = targets.GetValueOrDefault(goal.Id);
            MeasureFacts? measure = null;
            var measureLocked = false;
            if (target?.MeasureTarget is { } measureTarget)
            {
                var start = target.MeasureStart ?? 0;
                measureLocked = counted.Locked.Contains(goal.Id);
                measure = new MeasureFacts(start, measureTarget, start + counted.Totals.GetValueOrDefault(goal.Id));
            }

            var hasBody = body.TryGetValue(goal.Id, out var bodyPercent);
            var progress = GoalProgress.Of(new GoalProgressFacts(
                goal.Status, goal.MilestoneCount, goal.CompletedMilestoneCount,
                measure, savings.GetValueOrDefault(goal.Id)?.Percent, hasBody, bodyPercent));

            // A measure counting Health data reads as locked just like a body target.
            var locked = progress.Locked || (measureLocked && goal.Status != GoalStatuses.Completed);
            result[goal.Id] = new GoalProgressDto
            {
                Percent = locked ? 0 : progress.Percent,
                Kind = progress.Kind,
                Locked = locked,
                MeasureCurrent = measure is null || measureLocked ? null : measure.Current,
            };
        }

        return result;
    }

    public async Task<List<(DateOnly Day, decimal Amount)>?> MeasureHistoryAsync(int goalId, DateOnly today)
    {
        var goal = await db.Goals.Where(g => g.Id == goalId)
            .Select(g => new { g.MeasureTarget, g.MeasureStart, g.CreatedAt })
            .FirstOrDefaultAsync();
        if (goal?.MeasureTarget is null)
        {
            return null;
        }

        var history = new List<(DateOnly Day, decimal Amount)>();
        if (goal.MeasureStart is > 0 and var start)
        {
            history.Add((DateOnly.FromDateTime(goal.CreatedAt), start));
        }

        history.AddRange((await db.GoalMeasureEntries.Where(e => e.GoalId == goalId)
                .Select(e => new { e.EntryDate, e.Value }).ToListAsync())
            .Select(e => (e.EntryDate, e.Value)));

        var sources = (await db.GoalSources.Where(s => s.GoalId == goalId).ToListAsync()).Select(GoalSourceReader.ToRef).ToList();
        var amounts = await sourceReader.AmountsAsync(sources, today);
        if (amounts.Locked.Count > 0)
        {
            return null;
        }

        history.AddRange(amounts.ByDay.Values.SelectMany(list => list).Select(a => (a.Day, a.Amount)));
        return history.OrderBy(h => h.Day).ToList();
    }

    /// <summary>Logged entries + what every source counted, per goal; goals counting something locked are named.</summary>
    private async Task<(Dictionary<int, decimal> Totals, HashSet<int> Locked)> CountedAsync(List<int> goalIds, DateOnly today)
    {
        if (goalIds.Count == 0)
        {
            return ([], []);
        }

        var totals = (await db.GoalMeasureEntries
                .Where(e => goalIds.Contains(e.GoalId))
                .GroupBy(e => e.GoalId)
                .Select(g => new { GoalId = g.Key, Total = g.Sum(e => e.Value) })
                .ToListAsync())
            .ToDictionary(t => t.GoalId, t => t.Total);

        var sources = (await db.GoalSources.Where(s => goalIds.Contains(s.GoalId)).ToListAsync())
            .Select(GoalSourceReader.ToRef).ToList();
        var locked = new HashSet<int>();
        if (sources.Count > 0)
        {
            var amounts = await sourceReader.AmountsAsync(sources, today);
            foreach (var source in sources)
            {
                if (amounts.Locked.Contains(source.Id))
                {
                    locked.Add(source.GoalId);
                    continue;
                }

                totals[source.GoalId] = totals.GetValueOrDefault(source.GoalId) + amounts.Total(source.Id);
            }
        }

        return (totals, locked);
    }

    /// <summary>
    /// Goals with a Health body target: the % against the latest measurement with the vault unlocked, null without
    /// (only the fact that a target exists is read while locked).
    /// </summary>
    private async Task<Dictionary<int, int?>> BodyPercentsAsync(List<int> goalIds)
    {
        if (goalIds.Count == 0)
        {
            return [];
        }

        var targets = await db.GoalTargets.Where(t => goalIds.Contains(t.GoalId))
            .Select(t => new { t.GoalId, t.Kind, t.StartValue, t.TargetValue })
            .ToListAsync();
        if (targets.Count == 0)
        {
            return [];
        }

        if (!services.GetRequiredService<IVaultService>().IsUnlocked)
        {
            return targets.ToDictionary(t => t.GoalId, _ => (int?)null);
        }

        var kinds = targets.Select(t => t.Kind).Distinct().ToList();
        var latest = (await db.BodyMeasurements.Where(m => kinds.Contains(m.Kind))
                .Select(m => new { m.Kind, m.Value, m.MeasuredOn, m.Id })
                .ToListAsync())
            .GroupBy(m => m.Kind)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(m => m.MeasuredOn).ThenByDescending(m => m.Id).First().Value);
        return targets.ToDictionary(
            t => t.GoalId,
            t => (int?)HealthRecordRules.GoalPercent(t.StartValue, t.TargetValue, latest.TryGetValue(t.Kind, out var v) ? v : null));
    }
}
