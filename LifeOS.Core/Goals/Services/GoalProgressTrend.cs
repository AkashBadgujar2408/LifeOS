using LifeOS.Core.Goals.DTOs;

namespace LifeOS.Core.Goals.Services;

/// <summary>A milestone's life as far as progress goes: when it appeared, was ticked, and was removed.</summary>
public record TrendMilestone(DateTime CreatedAt, DateTime? CompletedAt, DateTime? DeletedAt);

/// <summary>A logged status change (goals.GoalHistory).</summary>
public record TrendStatusChange(DateTime At, string FromStatus, string ToStatus);

/// <summary>
/// A goal's progress over time, rebuilt from what's already recorded — milestones' created/completed/deleted moments
/// and the status history — so nothing extra is stored. At any moment the percent is exactly what
/// <see cref="GoalProgress.Percent"/> would have said then. Limitation: un-ticking a milestone clears its
/// CompletedAt, so an earlier tick that was later undone leaves no trace (only the latest tick of each counts).
/// </summary>
public static class GoalProgressTrend
{
    /// <summary>
    /// One point where the goal starts and one each time the percent changed, oldest first, plus a closing point at
    /// <paramref name="nowUtc"/> so the line runs up to today.
    /// </summary>
    public static List<GoalTrendPointDto> Build(
        DateTime goalCreatedAt,
        string currentStatus,
        IReadOnlyCollection<TrendMilestone> milestones,
        IReadOnlyCollection<TrendStatusChange> statusChanges,
        DateTime nowUtc)
    {
        var changes = statusChanges.OrderBy(c => c.At).ToList();
        // Goals before the history log (Session 11) have no changes: they've always been what they are now.
        var initialStatus = changes.Count > 0 ? changes[0].FromStatus : currentStatus;

        var moments = new SortedSet<DateTime> { goalCreatedAt };
        foreach (var m in milestones)
        {
            moments.Add(m.CreatedAt);
            if (m.CompletedAt is { } done)
            {
                moments.Add(done);
            }

            if (m.DeletedAt is { } deleted)
            {
                moments.Add(deleted);
            }
        }

        foreach (var c in changes)
        {
            moments.Add(c.At);
        }

        var points = new List<GoalTrendPointDto>();
        foreach (var at in moments.Where(t => t >= goalCreatedAt && t <= nowUtc))
        {
            var status = changes.LastOrDefault(c => c.At <= at)?.ToStatus ?? initialStatus;
            var live = milestones.Where(m => m.CreatedAt <= at && (m.DeletedAt is null || m.DeletedAt > at)).ToList();
            var percent = GoalProgress.Percent(status, live.Count, live.Count(m => m.CompletedAt <= at));
            if (points.Count == 0 || points[^1].Percent != percent)
            {
                points.Add(new GoalTrendPointDto { At = at, Percent = percent });
            }
        }

        if (points.Count > 0 && points[^1].At < nowUtc)
        {
            points.Add(new GoalTrendPointDto { At = nowUtc, Percent = points[^1].Percent });
        }

        return points;
    }

    /// <summary>
    /// A measured goal's % over time: the running total of what was already done, logged and counted, day by day
    /// (each day's amounts land at its start, UTC — the chart's x axis is days), 100% while Completed. Anything dated
    /// before the goal was created is already in its first point.
    /// </summary>
    public static List<GoalTrendPointDto> BuildMeasure(
        DateTime goalCreatedAt,
        string currentStatus,
        decimal target,
        IReadOnlyCollection<(DateOnly Day, decimal Amount)> amounts,
        IReadOnlyCollection<TrendStatusChange> statusChanges,
        DateTime nowUtc)
    {
        var changes = statusChanges.OrderBy(c => c.At).ToList();
        var initialStatus = changes.Count > 0 ? changes[0].FromStatus : currentStatus;
        var dated = amounts
            .Select(a => (At: a.Day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc), a.Amount))
            .ToList();

        var moments = new SortedSet<DateTime> { goalCreatedAt };
        foreach (var (at, _) in dated)
        {
            moments.Add(at < goalCreatedAt ? goalCreatedAt : at);
        }

        foreach (var c in changes)
        {
            moments.Add(c.At);
        }

        var points = new List<GoalTrendPointDto>();
        foreach (var at in moments.Where(t => t >= goalCreatedAt && t <= nowUtc))
        {
            var status = changes.LastOrDefault(c => c.At <= at)?.ToStatus ?? initialStatus;
            var total = dated.Where(d => d.At <= at).Sum(d => d.Amount);
            var percent = status == GoalStatuses.Completed
                ? 100
                : GoalProgress.MeasurePercent(new MeasureFacts(0, target, total));
            if (points.Count == 0 || points[^1].Percent != percent)
            {
                points.Add(new GoalTrendPointDto { At = at, Percent = percent });
            }
        }

        if (points.Count > 0 && points[^1].At < nowUtc)
        {
            points.Add(new GoalTrendPointDto { At = nowUtc, Percent = points[^1].Percent });
        }

        return points;
    }
}
