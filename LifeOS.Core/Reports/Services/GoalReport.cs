using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Reports.DTOs;

namespace LifeOS.Core.Reports.Services;

/// <summary>A goal as the achievement report reads it, its moments already on the user's local days.</summary>
public record GoalFact(
    int Id,
    string Title,
    string GoalType,
    string Status,
    int LifeAreaId,
    string LifeAreaName,
    DateOnly? TargetDate,
    DateOnly StartedOn,
    DateOnly? CompletedOn,
    DateOnly? AbandonedOn,
    int PushedBack);

/// <summary>
/// The goal achievement report (Session 90), computed per request and never stored: what each goal's range said
/// about it (one outcome — see <see cref="OutcomeOf"/>), counted overall and per life area.
/// </summary>
public static class GoalReport
{
    public static GoalReportDto Build(IReadOnlyCollection<GoalFact> goals, DateOnly from, DateOnly to, DateOnly today)
    {
        var items = goals
            .Select(g => (Goal: g, Outcome: OutcomeOf(g, from, to, today)))
            .Where(x => x.Outcome is not null)
            .Select(x => ToItem(x.Goal, x.Outcome!, today))
            .ToList();

        return new GoalReportDto
        {
            From = from,
            To = to,
            Totals = Count(items, from, to),
            Areas = items
                .GroupBy(i => (i.LifeAreaId, i.LifeAreaName))
                .OrderBy(g => g.Key.LifeAreaId)
                .Select(g =>
                {
                    var counts = Count(g.ToList(), from, to);
                    return new GoalReportAreaDto
                    {
                        LifeAreaId = g.Key.LifeAreaId,
                        LifeAreaName = g.Key.LifeAreaName,
                        Completed = counts.Completed,
                        OnTime = counts.OnTime,
                        Late = counts.Late,
                        NoTarget = counts.NoTarget,
                        Abandoned = counts.Abandoned,
                        Missed = counts.Missed,
                        InProgress = counts.InProgress,
                        PushedBack = counts.PushedBack,
                        Started = counts.Started,
                        OnTimePercent = counts.OnTimePercent,
                    };
                })
                .ToList(),
            Goals = items,
        };
    }

    /// <summary>
    /// What the range says about a goal, first match wins: completed in it (on time / late / no target day), abandoned
    /// in it, its target day in it and passed without it being done by then (missed — even if finished later), else
    /// still going if it was started or pushed back in it; null when the range has nothing to say about it.
    /// </summary>
    public static string? OutcomeOf(GoalFact goal, DateOnly from, DateOnly to, DateOnly today)
    {
        if (goal.Status == GoalStatuses.Completed && goal.CompletedOn is { } done && InRange(done, from, to))
        {
            return goal.TargetDate is not { } target ? GoalOutcomes.NoTarget
                : done <= target ? GoalOutcomes.OnTime
                : GoalOutcomes.Late;
        }

        if (goal.Status == GoalStatuses.Abandoned && goal.AbandonedOn is { } abandoned && InRange(abandoned, from, to))
        {
            return GoalOutcomes.Abandoned;
        }

        if (goal.TargetDate is { } due && InRange(due, from, to) && due < today
            && !(goal.CompletedOn is { } finished && finished <= due)
            && !(goal.Status == GoalStatuses.Abandoned && goal.AbandonedOn is { } dropped && dropped <= due))
        {
            return GoalOutcomes.Missed;
        }

        return InRange(goal.StartedOn, from, to) || goal.PushedBack > 0 ? GoalOutcomes.InProgress : null;
    }

    private static GoalReportItemDto ToItem(GoalFact g, string outcome, DateOnly today) => new()
    {
        Id = g.Id,
        Title = g.Title,
        GoalType = g.GoalType,
        Status = g.Status,
        LifeAreaId = g.LifeAreaId,
        LifeAreaName = g.LifeAreaName,
        Outcome = outcome,
        TargetDate = g.TargetDate,
        CompletedOn = g.CompletedOn,
        AbandonedOn = g.AbandonedOn,
        StartedOn = g.StartedOn,
        DaysLate = outcome switch
        {
            GoalOutcomes.Late => g.CompletedOn!.Value.DayNumber - g.TargetDate!.Value.DayNumber,
            // Missed: how late it was finished, else how long it has been open past the day (abandoned: until then).
            GoalOutcomes.Missed => (g.CompletedOn ?? g.AbandonedOn ?? today).DayNumber - g.TargetDate!.Value.DayNumber,
            _ => null,
        },
        PushedBack = g.PushedBack,
    };

    private static GoalReportCountsDto Count(IReadOnlyCollection<GoalReportItemDto> items, DateOnly from, DateOnly to)
    {
        int Of(string outcome) => items.Count(i => i.Outcome == outcome);
        var onTime = Of(GoalOutcomes.OnTime);
        var late = Of(GoalOutcomes.Late);
        var noTarget = Of(GoalOutcomes.NoTarget);
        return new GoalReportCountsDto
        {
            Completed = onTime + late + noTarget,
            OnTime = onTime,
            Late = late,
            NoTarget = noTarget,
            Abandoned = Of(GoalOutcomes.Abandoned),
            Missed = Of(GoalOutcomes.Missed),
            InProgress = Of(GoalOutcomes.InProgress),
            PushedBack = items.Count(i => i.PushedBack > 0),
            Started = items.Count(i => InRange(i.StartedOn, from, to)),
            OnTimePercent = ReportMath.Percent(onTime, onTime + late),
        };
    }

    private static bool InRange(DateOnly day, DateOnly from, DateOnly to) => day >= from && day <= to;
}

/// <summary>Small helpers every report shares.</summary>
public static class ReportMath
{
    /// <summary>part ÷ whole as a whole percent (halves round up, as on the client); null when whole is 0.</summary>
    public static int? Percent(int part, int whole) =>
        whole == 0 ? null : (int)Math.Round(100.0 * part / whole, MidpointRounding.AwayFromZero);

    /// <summary>The longest ask for one report: about five years of days.</summary>
    public const int MaxDays = 1830;

    /// <summary>
    /// The ISO weeks overlapping <paramref name="from"/>..<paramref name="to"/> up to <paramref name="today"/>, oldest
    /// first, each with the part of it inside the range (a first or last week can be partial). Empty when the range
    /// is all ahead.
    /// </summary>
    public static List<(DateOnly WeekStart, DateOnly From, DateOnly To)> Weeks(DateOnly from, DateOnly to, DateOnly today)
    {
        var last = to < today ? to : today;
        var weeks = new List<(DateOnly, DateOnly, DateOnly)>();
        for (var week = Journal.Services.JournalWeeks.WeekStart(from); week <= last; week = week.AddDays(7))
        {
            weeks.Add((week, week > from ? week : from, week.AddDays(6) < last ? week.AddDays(6) : last));
        }

        return weeks;
    }

    /// <summary>The average of the values given, to one decimal (null when none was given).</summary>
    public static decimal? Average(IEnumerable<int?> values)
    {
        var known = values.Where(v => v is not null).Select(v => v!.Value).ToList();
        return known.Count == 0 ? null : Math.Round((decimal)known.Average(), 1, MidpointRounding.AwayFromZero);
    }
}
