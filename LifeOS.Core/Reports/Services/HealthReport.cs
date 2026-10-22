using LifeOS.Core.Health.DTOs;
using LifeOS.Core.Health.Services;
using LifeOS.Core.Reports.DTOs;

namespace LifeOS.Core.Reports.Services;

public record WorkoutFact(DateOnly Day, string Kind, int Minutes, int? Steps, decimal? DistanceKm);

public record SleepFact(DateOnly WokeOn, int Minutes, byte? Quality, bool IsNap);

public record MeasurementFact(string Kind, DateOnly Day, decimal Value, decimal? Value2);

/// <summary>A day's stress / energy (Health) or mood (Journal) — whichever were given.</summary>
public record WellbeingFact(DateOnly Day, byte? Stress, byte? Energy, byte? Mood);

/// <summary>
/// The health report (Session 91), computed per request and never stored — behind the vault unlock. Counted the way
/// the Health pages count: nights through <see cref="HealthTrends.Nights"/> (naps out, a split night added up,
/// averages per night logged, quality per night first), totals of steps / km only over the workouts that gave them
/// (an unknown is never zero), averages over the days that have a value.
/// </summary>
public static class HealthReport
{
    public static HealthReportDto Build(
        IReadOnlyCollection<WorkoutFact> workouts,
        IReadOnlyCollection<SleepFact> sleep,
        IReadOnlyCollection<MeasurementFact> measurements,
        IReadOnlyCollection<WellbeingFact> wellbeing,
        DateOnly from,
        DateOnly to,
        DateOnly today)
    {
        var nights = HealthTrends.Nights(sleep.Select(s => (s.WokeOn, s.Minutes, s.Quality, s.IsNap)));
        var checkIns = wellbeing.Where(w => w.Stress is not null || w.Energy is not null).ToList();

        return new HealthReportDto
        {
            From = from,
            To = to,
            Workouts = new WorkoutReportDto
            {
                Sessions = workouts.Count,
                Minutes = workouts.Sum(w => w.Minutes),
                ActiveDays = workouts.Select(w => w.Day).Distinct().Count(),
                Steps = SumKnown(workouts.Select(w => w.Steps)),
                DistanceKm = SumKnown(workouts.Select(w => w.DistanceKm)),
                Kinds = workouts
                    .GroupBy(w => w.Kind)
                    .Select(g => new WorkoutKindReportDto
                    {
                        Kind = g.Key,
                        Sessions = g.Count(),
                        Minutes = g.Sum(w => w.Minutes),
                        DistanceKm = SumKnown(g.Select(w => w.DistanceKm)),
                    })
                    .OrderByDescending(k => k.Minutes).ThenBy(k => k.Kind, StringComparer.Ordinal)
                    .ToList(),
            },
            Sleep = new SleepReportDto
            {
                Nights = nights.Count,
                AverageMinutes = AverageMinutes(nights),
                AverageQuality = ReportMath.Average(nights.Select(n => (int?)n.Quality)),
            },
            Wellbeing = new WellbeingReportDto
            {
                CheckIns = checkIns.Count,
                AverageStress = ReportMath.Average(wellbeing.Select(w => (int?)w.Stress)),
                AverageEnergy = ReportMath.Average(wellbeing.Select(w => (int?)w.Energy)),
                MoodDays = wellbeing.Count(w => w.Mood is not null),
                AverageMood = ReportMath.Average(wellbeing.Select(w => (int?)w.Mood)),
            },
            Body = measurements
                .GroupBy(m => m.Kind)
                .OrderBy(g => g.Key, StringComparer.Ordinal)
                .Select(g =>
                {
                    var points = g.OrderBy(m => m.Day).ToList();
                    var (first, last) = (points[0], points[^1]);
                    return new BodyReportDto
                    {
                        Kind = g.Key,
                        Unit = HealthKinds.MeasurementUnits.GetValueOrDefault(g.Key, string.Empty),
                        Readings = points.Count,
                        FirstOn = first.Day,
                        First = first.Value,
                        First2 = first.Value2,
                        LastOn = last.Day,
                        Last = last.Value,
                        Last2 = last.Value2,
                        Change = last.Value - first.Value,
                        Change2 = last.Value2 - first.Value2,
                        Points = [.. points.Select(p => new BodyReadingDto { Day = p.Day, Value = p.Value, Value2 = p.Value2 })],
                    };
                })
                .ToList(),
            Weeks = ReportMath.Weeks(from, to, today)
                .Select(w =>
                {
                    bool In(DateOnly day) => day >= w.From && day <= w.To;
                    var weekNights = nights.Where(n => In(n.WokeOn)).ToList();
                    var weekDays = wellbeing.Where(d => In(d.Day)).ToList();
                    return new HealthWeekDto
                    {
                        WeekStart = w.WeekStart,
                        From = w.From,
                        To = w.To,
                        WorkoutMinutes = workouts.Where(x => In(x.Day)).Sum(x => x.Minutes),
                        SleepNights = weekNights.Count,
                        SleepAverageMinutes = AverageMinutes(weekNights),
                        AverageStress = ReportMath.Average(weekDays.Select(d => (int?)d.Stress)),
                        AverageEnergy = ReportMath.Average(weekDays.Select(d => (int?)d.Energy)),
                        AverageMood = ReportMath.Average(weekDays.Select(d => (int?)d.Mood)),
                    };
                })
                .ToList(),
        };
    }

    private static int? AverageMinutes(IReadOnlyCollection<SleepNightDto> nights) =>
        nights.Count == 0 ? null : (int)Math.Round(nights.Average(n => n.Minutes), MidpointRounding.AwayFromZero);

    private static int? SumKnown(IEnumerable<int?> values)
    {
        var known = values.Where(v => v is not null).ToList();
        return known.Count == 0 ? null : known.Sum();
    }

    private static decimal? SumKnown(IEnumerable<decimal?> values)
    {
        var known = values.Where(v => v is not null).ToList();
        return known.Count == 0 ? null : known.Sum();
    }
}
