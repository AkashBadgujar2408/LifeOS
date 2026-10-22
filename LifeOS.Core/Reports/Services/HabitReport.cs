using LifeOS.Core.Habits.DTOs;
using LifeOS.Core.Habits.Services;
using LifeOS.Core.Journal.Services;
using LifeOS.Core.Reports.DTOs;

namespace LifeOS.Core.Reports.Services;

/// <summary>A habit as the consistency report reads it (<paramref name="ArchivedOn"/> = the day it was put away).</summary>
public record HabitFact(
    int Id,
    string Title,
    string Kind,
    string Status,
    byte ScheduleDays,
    DateOnly StartDate,
    decimal? TargetValue,
    string? LifeAreaName,
    int? LifeAreaId,
    DateOnly? ArchivedOn);

/// <summary>One logged day of a habit (every entry; whether it counts is decided here).</summary>
public record HabitEntryFact(int HabitId, DateOnly Day, decimal? Value);

/// <summary>
/// The habit consistency report (Session 90), computed per request and never stored. A day counts the way the habit
/// page's "By weekday" counts it (<c>weekdayConsistency</c>): a build habit's scheduled days from its start, done =
/// <see cref="HabitStreaks.IsMet"/>, today only once done; an avoid habit's every day, clean = no entry, today
/// included. Archived habits count up to the day they were archived.
/// </summary>
public static class HabitReport
{
    public static HabitReportDto Build(
        IReadOnlyCollection<HabitFact> habits,
        IReadOnlyCollection<HabitEntryFact> entries,
        DateOnly from,
        DateOnly to,
        DateOnly today)
    {
        var byHabit = entries.ToLookup(e => e.HabitId);
        var last = to < today ? to : today;
        var weekBuild = new SortedDictionary<DateOnly, (int Total, int Good)>();
        for (var week = JournalWeeks.WeekStart(from); week <= last; week = week.AddDays(7))
        {
            weekBuild[week] = (0, 0);
        }

        var items = new List<HabitReportItemDto>();
        foreach (var habit in habits)
        {
            var avoid = habit.Kind == HabitKinds.Avoid;
            var logged = byHabit[habit.Id].ToDictionary(e => e.Day, e => e.Value);
            var first = habit.StartDate > from ? habit.StartDate : from;
            var end = habit.ArchivedOn is { } archived && archived < last ? archived : last;
            int total = 0, good = 0, slips = 0, run = 0, best = 0;

            for (var day = first; day <= end; day = day.AddDays(1))
            {
                bool counts;
                if (avoid)
                {
                    counts = !logged.ContainsKey(day);
                    if (!counts)
                    {
                        slips++;
                    }
                }
                else
                {
                    if (!HabitStreaks.IsScheduled(habit.ScheduleDays, day))
                    {
                        continue; // unscheduled days neither break nor extend a run
                    }

                    counts = logged.TryGetValue(day, out var value) && HabitStreaks.IsMet(value, habit.TargetValue);
                    if (day == today && !counts)
                    {
                        continue; // an unfinished today isn't a miss yet
                    }

                    var week = JournalWeeks.WeekStart(day);
                    var (wTotal, wGood) = weekBuild[week];
                    weekBuild[week] = (wTotal + 1, wGood + (counts ? 1 : 0));
                }

                total++;
                if (counts)
                {
                    good++;
                    run++;
                    best = Math.Max(best, run);
                }
                else
                {
                    run = 0;
                }
            }

            items.Add(new HabitReportItemDto
            {
                Id = habit.Id,
                Title = habit.Title,
                Kind = habit.Kind,
                Status = habit.Status,
                LifeAreaName = habit.LifeAreaName,
                LifeAreaId = habit.LifeAreaId,
                ScheduleDays = habit.ScheduleDays,
                Total = total,
                Good = good,
                Percent = ReportMath.Percent(good, total),
                Slips = slips,
                BestRun = best,
                ArchivedOn = habit.ArchivedOn,
            });
        }

        return new HabitReportDto
        {
            From = from,
            To = to,
            Build = Share(items.Where(i => i.Kind != HabitKinds.Avoid)),
            Avoid = Share(items.Where(i => i.Kind == HabitKinds.Avoid)),
            Habits = items,
            // Weeks before anything was scheduled (no habit had started yet) say nothing; later empty weeks stay as gaps.
            Weeks = weekBuild
                .SkipWhile(w => w.Value.Total == 0)
                .Select(w => new HabitReportWeekDto
                {
                    WeekStart = w.Key,
                    From = w.Key > from ? w.Key : from,
                    To = w.Key.AddDays(6) < last ? w.Key.AddDays(6) : last,
                    Total = w.Value.Total,
                    Good = w.Value.Good,
                    Percent = ReportMath.Percent(w.Value.Good, w.Value.Total),
                })
                .ToList(),
        };
    }

    private static HabitShareDto Share(IEnumerable<HabitReportItemDto> items)
    {
        var list = items.ToList();
        var total = list.Sum(i => i.Total);
        var good = list.Sum(i => i.Good);
        return new HabitShareDto { Total = total, Good = good, Percent = ReportMath.Percent(good, total) };
    }
}
