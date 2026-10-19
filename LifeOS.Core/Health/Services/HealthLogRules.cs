using LifeOS.Core.Health.DTOs;
using LifeOS.Core.Journal.Services;

namespace LifeOS.Core.Health.Services;

/// <summary>The checks on everyday health logs — the same limits the CHECKs in 13_health.sql hold.</summary>
public static class HealthLogRules
{
    public const int LongestSleepMinutes = 24 * 60;

    /// <summary>Sensible bounds per measurement kind (in its stored unit), so a typo like 700 kg is caught.</summary>
    public static readonly IReadOnlyDictionary<string, (decimal Min, decimal Max)> MeasurementBounds =
        new Dictionary<string, (decimal, decimal)>(StringComparer.Ordinal)
        {
            ["Weight"] = (1, 500), ["BodyFat"] = (1, 99.9m), ["Waist"] = (20, 300), ["Chest"] = (20, 300), ["Hips"] = (20, 300),
            ["BloodPressure"] = (40, 300), ["RestingHeartRate"] = (20, 250), ["BloodSugar"] = (10, 1000),
        };

    public static string? CheckWorkout(WorkoutRequest request)
    {
        if (!HealthKinds.WorkoutKinds.Contains(request.Kind))
        {
            return "Choose what kind of exercise it was.";
        }

        if (request.OccurredOn > request.Today)
        {
            return "Exercise can't be logged ahead of the day.";
        }

        if (request.Minutes is < 1 or > 1440)
        {
            return "Give the minutes (1 to 1,440).";
        }

        if (request.Steps is < 0 or > 200_000)
        {
            return "Steps should be between 0 and 200,000.";
        }

        if (request.DistanceKm is <= 0 or > 9999)
        {
            return "Distance has to be more than zero — or leave it blank.";
        }

        if (request.Calories is < 0 or > 20_000)
        {
            return "Calories should be between 0 and 20,000.";
        }

        return request.Intensity is not null && !HealthKinds.Intensities.Contains(request.Intensity)
            ? "Choose light, moderate or hard."
            : null;
    }

    public static string? CheckSleep(SleepRequest request, DateTime nowUtc)
    {
        if (request.StartedAt.Kind == DateTimeKind.Unspecified || request.EndedAt.Kind == DateTimeKind.Unspecified)
        {
            return "Give the times with a timezone.";
        }

        var start = request.StartedAt.ToUniversalTime();
        var end = request.EndedAt.ToUniversalTime();
        if (end <= start)
        {
            return "Waking up has to come after going to sleep.";
        }

        if ((end - start).TotalMinutes > LongestSleepMinutes)
        {
            return "A sleep can't be longer than 24 hours.";
        }

        if (end > nowUtc.AddMinutes(5) || request.WokeOn > request.Today)
        {
            return "Sleep can't be logged ahead of time.";
        }

        return request.Quality is < 1 or > 5 ? "Rate it 1 to 5, or leave it blank." : null;
    }

    public static string? CheckMeasurement(MeasurementRequest request)
    {
        if (!MeasurementBounds.TryGetValue(request.Kind, out var bounds))
        {
            return "Choose what was measured.";
        }

        if (request.MeasuredOn > request.Today)
        {
            return "A measurement can't be dated in the future.";
        }

        if (request.Value < bounds.Min || request.Value > bounds.Max)
        {
            return $"That looks off — expected {bounds.Min:0.##} to {bounds.Max:0.##} {HealthKinds.MeasurementUnits[request.Kind]}.";
        }

        if (request.Kind == "BloodPressure")
        {
            if (request.Value2 is not { } diastolic)
            {
                return "Give both numbers (e.g. 120 / 80).";
            }

            if (diastolic < 20 || diastolic >= request.Value)
            {
                return "The second number (diastolic) should be lower than the first.";
            }
        }
        else if (request.Value2 is not null)
        {
            return "Only blood pressure has a second number.";
        }

        return null;
    }

    public static string? CheckMeal(MealRequest request)
    {
        if (!HealthKinds.MealTypes.Contains(request.MealType))
        {
            return "Choose breakfast, lunch, dinner or a snack.";
        }

        if (string.IsNullOrWhiteSpace(request.Description))
        {
            return "Say what you ate.";
        }

        if (request.EatenOn > request.Today)
        {
            return "Meals can't be logged ahead of the day.";
        }

        if (request.Calories is < 0 or > 10_000)
        {
            return "Calories should be between 0 and 10,000.";
        }

        return request.ProteinG < 0 || request.CarbsG < 0 || request.FatG < 0 || request.ProteinG > 9999
            || request.CarbsG > 9999 || request.FatG > 9999
            ? "Grams can't be negative."
            : null;
    }

    public static string? CheckWater(WaterRequest request)
    {
        if (request.DrunkOn > request.Today)
        {
            return "Water can't be logged ahead of the day.";
        }

        return request.Millilitres is < 1 or > 5000 ? "Between 1 and 5,000 ml at a time." : null;
    }
}

/// <summary>Figures over time — always computed from the logs, never stored.</summary>
public static class HealthTrends
{
    /// <summary>The <paramref name="count"/> ISO weeks up to the one holding <paramref name="today"/>, oldest first.</summary>
    public static List<WorkoutWeekDto> Weeks(IEnumerable<(DateOnly Day, int Minutes, int? Steps)> workouts, DateOnly today, int count)
    {
        var thisWeek = JournalWeeks.WeekStart(today);
        var byWeek = workouts
            .GroupBy(w => JournalWeeks.WeekStart(w.Day))
            .ToDictionary(g => g.Key, g => (Minutes: g.Sum(w => w.Minutes), Sessions: g.Count(), Steps: g.Sum(w => w.Steps ?? 0)));
        return Enumerable.Range(0, count)
            .Select(i => thisWeek.AddDays(-7 * (count - 1 - i)))
            .Select(week => byWeek.TryGetValue(week, out var t)
                ? new WorkoutWeekDto { WeekStart = week, Minutes = t.Minutes, Sessions = t.Sessions, Steps = t.Steps }
                : new WorkoutWeekDto { WeekStart = week })
            .ToList();
    }

    public static int Minutes(DateTime startedAt, DateTime endedAt) => (int)Math.Round((endedAt - startedAt).TotalMinutes);

    /// <summary>
    /// Nights from the main sleeps (naps left out): one per morning, adding up a night split in two; the quality is
    /// the average of what was rated.
    /// </summary>
    public static List<SleepNightDto> Nights(IEnumerable<(DateOnly WokeOn, int Minutes, byte? Quality, bool IsNap)> records) =>
        records.Where(r => !r.IsNap)
            .GroupBy(r => r.WokeOn)
            .OrderBy(g => g.Key)
            .Select(g =>
            {
                var rated = g.Where(r => r.Quality is not null).Select(r => (int)r.Quality!.Value).ToList();
                return new SleepNightDto
                {
                    WokeOn = g.Key,
                    Minutes = g.Sum(r => r.Minutes),
                    Quality = rated.Count == 0 ? null : (byte)Math.Round(rated.Average(), MidpointRounding.AwayFromZero),
                };
            })
            .ToList();

    /// <summary>Average minutes per night logged in the <paramref name="days"/> days up to today (null: none logged).</summary>
    public static int? AverageMinutes(IReadOnlyCollection<SleepNightDto> nights, DateOnly today, int days)
    {
        var inWindow = Window(nights, today, days).ToList();
        return inWindow.Count == 0 ? null : (int)Math.Round(inWindow.Average(n => n.Minutes), MidpointRounding.AwayFromZero);
    }

    public static decimal? AverageQuality(IReadOnlyCollection<SleepNightDto> nights, DateOnly today, int days)
    {
        var rated = Window(nights, today, days).Where(n => n.Quality is not null).ToList();
        return rated.Count == 0 ? null : Math.Round((decimal)rated.Average(n => (int)n.Quality!.Value), 1, MidpointRounding.AwayFromZero);
    }

    public static int NightsLogged(IReadOnlyCollection<SleepNightDto> nights, DateOnly today, int days) =>
        Window(nights, today, days).Count();

    private static IEnumerable<SleepNightDto> Window(IEnumerable<SleepNightDto> nights, DateOnly today, int days)
    {
        var from = today.AddDays(-(days - 1));
        return nights.Where(n => n.WokeOn >= from && n.WokeOn <= today);
    }

    /// <summary>
    /// Totals per day from <paramref name="from"/> to <paramref name="to"/>, every day present. Calories add up only
    /// the meals that gave a figure (null when none did) — an unknown is never counted as zero.
    /// </summary>
    public static List<NutritionTrendDayDto> NutritionDays(
        IEnumerable<(DateOnly Day, int? Calories)> meals, IEnumerable<(DateOnly Day, int Millilitres)> water, DateOnly from, DateOnly to)
    {
        var mealsByDay = meals.GroupBy(m => m.Day).ToDictionary(g => g.Key, g => g.ToList());
        var waterByDay = water.GroupBy(w => w.Day).ToDictionary(g => g.Key, g => g.Sum(w => w.Millilitres));
        var days = new List<NutritionTrendDayDto>();
        for (var day = from; day <= to; day = day.AddDays(1))
        {
            var dayMeals = mealsByDay.GetValueOrDefault(day) ?? [];
            var known = dayMeals.Where(m => m.Calories is not null).ToList();
            days.Add(new NutritionTrendDayDto
            {
                Day = day,
                Meals = dayMeals.Count,
                Calories = known.Count == 0 ? null : known.Sum(m => m.Calories!.Value),
                WaterMl = waterByDay.GetValueOrDefault(day),
            });
        }

        return days;
    }

    /// <summary>The latest measurement of each kind with its change since the one before (same kind).</summary>
    public static List<MeasurementLatestDto> Latest(IEnumerable<MeasurementDto> measurements) =>
        measurements.GroupBy(m => m.Kind)
            .Select(g =>
            {
                var ordered = g.OrderByDescending(m => m.MeasuredOn).ThenByDescending(m => m.Id).ToList();
                var previous = ordered.Count > 1 ? ordered[1] : null;
                return new MeasurementLatestDto
                {
                    Kind = g.Key,
                    Unit = HealthKinds.MeasurementUnits[g.Key],
                    Latest = ordered[0],
                    Change = previous is null ? null : ordered[0].Value - previous.Value,
                    PreviousOn = previous?.MeasuredOn,
                    Count = ordered.Count,
                };
            })
            .OrderBy(l => HealthKinds.MeasurementUnits.Keys.ToList().IndexOf(l.Kind))
            .ToList();
}
