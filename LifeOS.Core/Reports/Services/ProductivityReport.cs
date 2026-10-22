using LifeOS.Core.Reports.DTOs;

namespace LifeOS.Core.Reports.Services;

/// <summary>A task as the productivity report reads it, its moments already on the user's local days.</summary>
public record TaskFact(
    int Id,
    string Title,
    string? ProjectName,
    DateOnly? DueDate,
    DateOnly? CompletedOn,
    DateOnly CreatedOn,
    int? EstimateMinutes,
    int FocusMinutes,
    int? LifeAreaId);

/// <summary>Tracked time on one local day (a focus, study or practice session) and the life area it served.</summary>
public record TimeFact(DateOnly Day, int Minutes, int? LifeAreaId);

/// <summary>A planned time block: a timed calendar event (or one occurrence of a series) in UTC.</summary>
public record BlockFact(DateTime StartsAt, DateTime EndsAt, int? LifeAreaId);

/// <summary>A life area of the taxonomy, in its order.</summary>
public record AreaFact(int Id, string Name);

/// <summary>
/// The productivity report (Session 91), computed per request and never stored: tasks done (on time / late / no due
/// day — one outcome per task, see <see cref="OutcomeOf"/>), the overdue rate, estimated vs actual time, focus time
/// week by week, and planned vs tracked time by life area (time blocks against focus, study and practice).
/// </summary>
public static class ProductivityReport
{
    public const string NoAreaName = "No life area";

    public static ProductivityReportDto Build(
        IReadOnlyCollection<TaskFact> tasks,
        IReadOnlyCollection<TimeFact> focus,
        IReadOnlyCollection<TimeFact> study,
        IReadOnlyCollection<TimeFact> practice,
        IReadOnlyCollection<BlockFact> blocks,
        IReadOnlyList<AreaFact> areas,
        DateOnly from,
        DateOnly to,
        DateOnly today,
        DateTime fromUtc,
        DateTime toUtc)
    {
        var areaNames = areas.ToDictionary(a => a.Id, a => a.Name);
        var items = tasks
            .Select(t => (Task: t, Outcome: OutcomeOf(t, from, to, today)))
            .Where(x => x.Outcome is not null)
            .Select(x => ToItem(x.Task, x.Outcome!, today, areaNames))
            .ToList();

        int Of(string outcome) => items.Count(i => i.Outcome == outcome);
        var duePassed = tasks.Where(t => DuePassed(t, from, to, today)).ToList();
        var doneByDue = duePassed.Count(DoneByDue);
        var estimated = items
            .Where(i => i.Outcome != TaskOutcomes.Overdue && i.EstimateMinutes is not null)
            .ToList();
        var estimateMinutes = estimated.Sum(i => i.EstimateMinutes!.Value);
        var actualMinutes = estimated.Sum(i => i.ActualMinutes);

        return new ProductivityReportDto
        {
            From = from,
            To = to,
            Tasks = new TaskReportCountsDto
            {
                Completed = Of(TaskOutcomes.OnTime) + Of(TaskOutcomes.Late) + Of(TaskOutcomes.NoDueDate),
                OnTime = Of(TaskOutcomes.OnTime),
                Late = Of(TaskOutcomes.Late),
                NoDueDate = Of(TaskOutcomes.NoDueDate),
                Created = tasks.Count(t => InRange(t.CreatedOn, from, to)),
                DuePassed = duePassed.Count,
                DoneByDue = doneByDue,
                Overdue = duePassed.Count - doneByDue,
                OverdueRate = ReportMath.Percent(duePassed.Count - doneByDue, duePassed.Count),
            },
            Estimates = new EstimateReportDto
            {
                Tasks = estimated.Count,
                EstimateMinutes = estimateMinutes,
                ActualMinutes = actualMinutes,
                Over = estimated.Count(i => i.ActualMinutes > i.EstimateMinutes),
                WithinEstimate = estimated.Count(i => i.ActualMinutes <= i.EstimateMinutes),
                ActualPercent = ReportMath.Percent(actualMinutes, estimateMinutes),
            },
            Focus = new FocusReportDto
            {
                Minutes = focus.Sum(f => f.Minutes),
                Sessions = focus.Count,
                Days = focus.Select(f => f.Day).Distinct().Count(),
            },
            Weeks = ReportMath.Weeks(from, to, today)
                .Select(w => new ProductivityWeekDto
                {
                    WeekStart = w.WeekStart,
                    From = w.From,
                    To = w.To,
                    TasksDone = items.Count(i => i.Outcome != TaskOutcomes.Overdue && i.CompletedOn >= w.From && i.CompletedOn <= w.To),
                    FocusMinutes = focus.Where(f => f.Day >= w.From && f.Day <= w.To).Sum(f => f.Minutes),
                })
                .ToList(),
            Areas = TimeByArea(focus, study, practice, blocks, areas, fromUtc, toUtc),
            TaskItems = items,
        };
    }

    /// <summary>
    /// What the range says about a task, first match wins: done in it (on time / late / no due day), else its due day
    /// in it and passed without it being done by then (overdue — even if done later); null when it says nothing.
    /// </summary>
    public static string? OutcomeOf(TaskFact task, DateOnly from, DateOnly to, DateOnly today)
    {
        if (task.CompletedOn is { } done && InRange(done, from, to))
        {
            return task.DueDate is not { } due ? TaskOutcomes.NoDueDate
                : done <= due ? TaskOutcomes.OnTime
                : TaskOutcomes.Late;
        }

        return DuePassed(task, from, to, today) && !DoneByDue(task) ? TaskOutcomes.Overdue : null;
    }

    /// <summary>
    /// Due in the range on a day that has passed — or done by a due day still to come (like a habit's today, a task
    /// due today only counts once it's done, so an unfinished today isn't overdue yet).
    /// </summary>
    private static bool DuePassed(TaskFact task, DateOnly from, DateOnly to, DateOnly today) =>
        task.DueDate is { } due && InRange(due, from, to) && (due < today || DoneByDue(task));

    private static bool DoneByDue(TaskFact task) =>
        task.CompletedOn is { } done && task.DueDate is { } due && done <= due;

    private static TaskReportItemDto ToItem(TaskFact t, string outcome, DateOnly today, Dictionary<int, string> areaNames) => new()
    {
        Id = t.Id,
        Title = t.Title,
        ProjectName = t.ProjectName,
        LifeAreaName = t.LifeAreaId is { } area ? areaNames.GetValueOrDefault(area) : null,
        Outcome = outcome,
        DueDate = t.DueDate,
        CompletedOn = t.CompletedOn,
        DaysLate = outcome switch
        {
            TaskOutcomes.Late => t.CompletedOn!.Value.DayNumber - t.DueDate!.Value.DayNumber,
            TaskOutcomes.Overdue => (t.CompletedOn ?? today).DayNumber - t.DueDate!.Value.DayNumber,
            _ => null,
        },
        EstimateMinutes = t.EstimateMinutes,
        ActualMinutes = t.FocusMinutes,
    };

    /// <summary>
    /// Planned (time blocks clipped to the range, as the calendar's "This week by life area" strip clips them to the
    /// week) against tracked time per life area — taxonomy order, no life area last, areas with nothing left out.
    /// </summary>
    internal static List<TimeByAreaDto> TimeByArea(
        IEnumerable<TimeFact> focus,
        IEnumerable<TimeFact> study,
        IEnumerable<TimeFact> practice,
        IEnumerable<BlockFact> blocks,
        IReadOnlyList<AreaFact> areas,
        DateTime fromUtc,
        DateTime toUtc)
    {
        var planned = new Dictionary<int, double>();
        foreach (var block in blocks)
        {
            var start = block.StartsAt > fromUtc ? block.StartsAt : fromUtc;
            var end = block.EndsAt < toUtc ? block.EndsAt : toUtc;
            if (end > start)
            {
                var key = block.LifeAreaId ?? 0;
                planned[key] = planned.GetValueOrDefault(key) + (end - start).TotalMinutes;
            }
        }

        static Dictionary<int, int> Sum(IEnumerable<TimeFact> facts) =>
            facts.GroupBy(f => f.LifeAreaId ?? 0).ToDictionary(g => g.Key, g => g.Sum(f => f.Minutes));
        var focused = Sum(focus);
        var studied = Sum(study);
        var practised = Sum(practice);

        return areas.Select(a => (Id: (int?)a.Id, Key: a.Id, a.Name))
            .Append((Id: null, Key: 0, Name: NoAreaName))
            .Select(a =>
            {
                var f = focused.GetValueOrDefault(a.Key);
                var s = studied.GetValueOrDefault(a.Key);
                var p = practised.GetValueOrDefault(a.Key);
                return new TimeByAreaDto
                {
                    LifeAreaId = a.Id,
                    LifeAreaName = a.Name,
                    PlannedMinutes = (int)Math.Round(planned.GetValueOrDefault(a.Key), MidpointRounding.AwayFromZero),
                    FocusMinutes = f,
                    StudyMinutes = s,
                    PracticeMinutes = p,
                    TrackedMinutes = f + s + p,
                };
            })
            .Where(a => a.PlannedMinutes > 0 || a.TrackedMinutes > 0)
            .ToList();
    }

    private static bool InRange(DateOnly day, DateOnly from, DateOnly to) => day >= from && day <= to;
}
