using LifeOS.Core.Health.DTOs;
using LifeOS.Core.Health.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Health.Services;

/// <summary>Exercise. Weekly totals come from <see cref="HealthTrends.Weeks"/> over every workout in those weeks.</summary>
public class WorkoutsService(AppDbContext db) : IWorkoutsService
{
    private const string NotFound = "Workout not found.";

    public async Task<FitnessDto> GetAsync(DateOnly from, DateOnly to, DateOnly today, int weeks)
    {
        weeks = Math.Clamp(weeks, 1, 104);
        var firstWeek = Journal.Services.JournalWeeks.WeekStart(today).AddDays(-7 * (weeks - 1));
        var earliest = from < firstWeek ? from : firstWeek;
        var rows = await db.Workouts.AsNoTracking()
            .Where(w => w.OccurredOn >= earliest && w.OccurredOn <= (to > today ? to : today))
            .ToListAsync();
        return new FitnessDto
        {
            Workouts = rows.Where(w => w.OccurredOn >= from && w.OccurredOn <= to)
                .OrderByDescending(w => w.OccurredOn).ThenByDescending(w => w.Id)
                .Select(ToDto).ToList(),
            Weeks = HealthTrends.Weeks(rows.Where(w => w.OccurredOn <= today).Select(w => (w.OccurredOn, w.Minutes, w.Steps)), today, weeks),
        };
    }

    public async Task<OperationResult<WorkoutDto>> CreateAsync(WorkoutRequest request)
    {
        if (HealthLogRules.CheckWorkout(request) is { } error)
        {
            return OperationResult<WorkoutDto>.Fail(error);
        }

        var workout = new Workout { UserId = db.CurrentUserId!.Value };
        Apply(workout, request);
        db.Workouts.Add(workout);
        await db.SaveChangesAsync();
        return OperationResult<WorkoutDto>.Ok(ToDto(workout));
    }

    public async Task<OperationResult<WorkoutDto>> UpdateAsync(int id, WorkoutRequest request)
    {
        var workout = await db.Workouts.FindAsync(id);
        if (workout is null)
        {
            return OperationResult<WorkoutDto>.Fail(NotFound);
        }

        if (HealthLogRules.CheckWorkout(request) is { } error)
        {
            return OperationResult<WorkoutDto>.Fail(error);
        }

        Apply(workout, request);
        workout.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<WorkoutDto>.Ok(ToDto(workout));
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var workout = await db.Workouts.FindAsync(id);
        if (workout is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        workout.IsDeleted = true;
        workout.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    private static void Apply(Workout workout, WorkoutRequest request)
    {
        workout.Kind = request.Kind;
        workout.OccurredOn = request.OccurredOn;
        workout.Minutes = request.Minutes;
        workout.Steps = request.Steps;
        workout.DistanceKm = request.DistanceKm is { } km ? Math.Round(km, 2, MidpointRounding.AwayFromZero) : null;
        workout.Calories = request.Calories;
        workout.Intensity = request.Intensity;
        workout.Notes = HealthRules.Text(request.Notes);
    }

    private static WorkoutDto ToDto(Workout w) => new()
    {
        Id = w.Id,
        Kind = w.Kind,
        OccurredOn = w.OccurredOn,
        Minutes = w.Minutes,
        Steps = w.Steps,
        DistanceKm = w.DistanceKm,
        Calories = w.Calories,
        Intensity = w.Intensity,
        Notes = w.Notes,
    };
}

/// <summary>Sleep. A record counts for its WokeOn day; averages are per night logged (naps left out).</summary>
public class SleepService(AppDbContext db) : ISleepService
{
    private const string NotFound = "Sleep record not found.";
    private const int SummaryDays = 30;

    public async Task<SleepSummaryDto> GetAsync(DateOnly from, DateOnly to, DateOnly today)
    {
        var windowStart = today.AddDays(-(SummaryDays - 1));
        var earliest = from < windowStart ? from : windowStart;
        var latest = to > today ? to : today;
        var rows = await db.SleepRecords.AsNoTracking()
            .Where(s => s.WokeOn >= earliest && s.WokeOn <= latest)
            .ToListAsync();
        var nights = HealthTrends.Nights(rows.Select(r => (r.WokeOn, HealthTrends.Minutes(r.StartedAt, r.EndedAt), r.Quality, r.IsNap)));
        return new SleepSummaryDto
        {
            Records = rows.Where(r => r.WokeOn >= from && r.WokeOn <= to)
                .OrderByDescending(r => r.WokeOn).ThenByDescending(r => r.StartedAt)
                .Select(ToDto).ToList(),
            Nights = nights.Where(n => n.WokeOn >= from && n.WokeOn <= to).ToList(),
            Average7Minutes = HealthTrends.AverageMinutes(nights, today, 7),
            Average30Minutes = HealthTrends.AverageMinutes(nights, today, SummaryDays),
            AverageQuality30 = HealthTrends.AverageQuality(nights, today, SummaryDays),
            NightsLogged30 = HealthTrends.NightsLogged(nights, today, SummaryDays),
        };
    }

    public async Task<OperationResult<SleepRecordDto>> CreateAsync(SleepRequest request)
    {
        if (HealthLogRules.CheckSleep(request, DateTime.UtcNow) is { } error)
        {
            return OperationResult<SleepRecordDto>.Fail(error);
        }

        var record = new SleepRecord { UserId = db.CurrentUserId!.Value };
        if (await ApplyAsync(record, request) is { } overlap)
        {
            return OperationResult<SleepRecordDto>.Fail(overlap);
        }

        db.SleepRecords.Add(record);
        await db.SaveChangesAsync();
        return OperationResult<SleepRecordDto>.Ok(ToDto(record));
    }

    public async Task<OperationResult<SleepRecordDto>> UpdateAsync(int id, SleepRequest request)
    {
        var record = await db.SleepRecords.FindAsync(id);
        if (record is null)
        {
            return OperationResult<SleepRecordDto>.Fail(NotFound);
        }

        if (HealthLogRules.CheckSleep(request, DateTime.UtcNow) is { } error)
        {
            return OperationResult<SleepRecordDto>.Fail(error);
        }

        if (await ApplyAsync(record, request) is { } overlap)
        {
            return OperationResult<SleepRecordDto>.Fail(overlap);
        }

        record.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<SleepRecordDto>.Ok(ToDto(record));
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var record = await db.SleepRecords.FindAsync(id);
        if (record is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        record.IsDeleted = true;
        record.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    /// <summary>Fills the record; refuses one that overlaps another (you can't sleep twice at once).</summary>
    private async Task<string?> ApplyAsync(SleepRecord record, SleepRequest request)
    {
        var start = request.StartedAt.ToUniversalTime();
        var end = request.EndedAt.ToUniversalTime();
        if (await db.SleepRecords.AnyAsync(s => s.Id != record.Id && s.StartedAt < end && s.EndedAt > start))
        {
            return "That overlaps sleep you've already logged.";
        }

        record.WokeOn = request.WokeOn;
        record.StartedAt = start;
        record.EndedAt = end;
        record.Quality = request.Quality;
        record.IsNap = request.IsNap;
        record.Notes = HealthRules.Text(request.Notes);
        return null;
    }

    private static SleepRecordDto ToDto(SleepRecord s) => new()
    {
        Id = s.Id,
        WokeOn = s.WokeOn,
        StartedAt = s.StartedAt,
        EndedAt = s.EndedAt,
        Minutes = HealthTrends.Minutes(s.StartedAt, s.EndedAt),
        Quality = s.Quality,
        IsNap = s.IsNap,
        Notes = s.Notes,
    };
}

/// <summary>Body measurements, each in its kind's one unit.</summary>
public class MeasurementsService(AppDbContext db) : IMeasurementsService
{
    private const string NotFound = "Measurement not found.";

    public async Task<List<MeasurementLatestDto>> GetLatestAsync() =>
        HealthTrends.Latest((await db.BodyMeasurements.AsNoTracking().ToListAsync()).Select(ToDto));

    public async Task<List<MeasurementDto>> GetKindAsync(string kind) =>
        (await db.BodyMeasurements.AsNoTracking().Where(m => m.Kind == kind)
            .OrderBy(m => m.MeasuredOn).ThenBy(m => m.Id).ToListAsync())
        .Select(ToDto).ToList();

    public async Task<OperationResult<MeasurementDto>> CreateAsync(MeasurementRequest request)
    {
        if (HealthLogRules.CheckMeasurement(request) is { } error)
        {
            return OperationResult<MeasurementDto>.Fail(error);
        }

        var measurement = new BodyMeasurement { UserId = db.CurrentUserId!.Value };
        Apply(measurement, request);
        db.BodyMeasurements.Add(measurement);
        await db.SaveChangesAsync();
        return OperationResult<MeasurementDto>.Ok(ToDto(measurement));
    }

    public async Task<OperationResult<MeasurementDto>> UpdateAsync(int id, MeasurementRequest request)
    {
        var measurement = await db.BodyMeasurements.FindAsync(id);
        if (measurement is null)
        {
            return OperationResult<MeasurementDto>.Fail(NotFound);
        }

        if (HealthLogRules.CheckMeasurement(request) is { } error)
        {
            return OperationResult<MeasurementDto>.Fail(error);
        }

        Apply(measurement, request);
        measurement.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<MeasurementDto>.Ok(ToDto(measurement));
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var measurement = await db.BodyMeasurements.FindAsync(id);
        if (measurement is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        measurement.IsDeleted = true;
        measurement.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    private static void Apply(BodyMeasurement measurement, MeasurementRequest request)
    {
        measurement.Kind = request.Kind;
        measurement.MeasuredOn = request.MeasuredOn;
        measurement.Value = Math.Round(request.Value, 2, MidpointRounding.AwayFromZero);
        measurement.Value2 = request.Value2 is { } v2 ? Math.Round(v2, 2, MidpointRounding.AwayFromZero) : null;
        measurement.Notes = HealthRules.Text(request.Notes);
    }

    internal static MeasurementDto ToDto(BodyMeasurement m) => new()
    {
        Id = m.Id,
        Kind = m.Kind,
        MeasuredOn = m.MeasuredOn,
        Value = m.Value,
        Value2 = m.Value2,
        Notes = m.Notes,
    };
}

/// <summary>Meals and water. Day totals add up only the figures given (an unknown never counts as zero).</summary>
public class NutritionService(AppDbContext db) : INutritionService
{
    private const string NotFound = "Meal not found.";
    private const int LongestTrendDays = 400;

    public async Task<NutritionDayDto> GetDayAsync(DateOnly day)
    {
        var meals = await db.Meals.AsNoTracking().Where(m => m.EatenOn == day).ToListAsync();
        var water = await db.WaterIntakes.AsNoTracking().Where(w => w.DrunkOn == day).OrderBy(w => w.CreatedAt).ToListAsync();
        var order = HealthKinds.MealTypes.ToList();
        return new NutritionDayDto
        {
            Day = day,
            Meals = meals.OrderBy(m => order.IndexOf(m.MealType)).ThenBy(m => m.Id).Select(ToDto).ToList(),
            Water = water.Select(w => new WaterDto { Id = w.Id, Millilitres = w.Millilitres, CreatedAt = w.CreatedAt }).ToList(),
            WaterMl = water.Sum(w => w.Millilitres),
            Calories = meals.Any(m => m.Calories is not null) ? meals.Sum(m => m.Calories ?? 0) : null,
            ProteinG = meals.Any(m => m.ProteinG is not null) ? meals.Sum(m => m.ProteinG ?? 0) : null,
        };
    }

    public async Task<List<NutritionTrendDayDto>> GetTrendAsync(DateOnly from, DateOnly to)
    {
        if (to < from || to.DayNumber - from.DayNumber >= LongestTrendDays)
        {
            return [];
        }

        var meals = await db.Meals.AsNoTracking().Where(m => m.EatenOn >= from && m.EatenOn <= to)
            .Select(m => new { m.EatenOn, m.Calories }).ToListAsync();
        var water = await db.WaterIntakes.AsNoTracking().Where(w => w.DrunkOn >= from && w.DrunkOn <= to)
            .Select(w => new { w.DrunkOn, w.Millilitres }).ToListAsync();
        return HealthTrends.NutritionDays(meals.Select(m => (m.EatenOn, m.Calories)), water.Select(w => (w.DrunkOn, w.Millilitres)), from, to);
    }

    public async Task<OperationResult<MealDto>> CreateMealAsync(MealRequest request)
    {
        if (HealthLogRules.CheckMeal(request) is { } error)
        {
            return OperationResult<MealDto>.Fail(error);
        }

        var meal = new Meal { UserId = db.CurrentUserId!.Value };
        Apply(meal, request);
        db.Meals.Add(meal);
        await db.SaveChangesAsync();
        return OperationResult<MealDto>.Ok(ToDto(meal));
    }

    public async Task<OperationResult<MealDto>> UpdateMealAsync(int id, MealRequest request)
    {
        var meal = await db.Meals.FindAsync(id);
        if (meal is null)
        {
            return OperationResult<MealDto>.Fail(NotFound);
        }

        if (HealthLogRules.CheckMeal(request) is { } error)
        {
            return OperationResult<MealDto>.Fail(error);
        }

        Apply(meal, request);
        meal.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<MealDto>.Ok(ToDto(meal));
    }

    public async Task<OperationResult<bool>> DeleteMealAsync(int id)
    {
        var meal = await db.Meals.FindAsync(id);
        if (meal is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        meal.IsDeleted = true;
        meal.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task<OperationResult<NutritionDayDto>> AddWaterAsync(WaterRequest request)
    {
        if (HealthLogRules.CheckWater(request) is { } error)
        {
            return OperationResult<NutritionDayDto>.Fail(error);
        }

        db.WaterIntakes.Add(new WaterIntake { UserId = db.CurrentUserId!.Value, DrunkOn = request.DrunkOn, Millilitres = request.Millilitres });
        await db.SaveChangesAsync();
        return OperationResult<NutritionDayDto>.Ok(await GetDayAsync(request.DrunkOn));
    }

    public async Task<OperationResult<NutritionDayDto>> RemoveWaterAsync(int id)
    {
        var water = await db.WaterIntakes.FindAsync(id);
        if (water is null)
        {
            return OperationResult<NutritionDayDto>.Fail("That glass wasn't found.");
        }

        water.IsDeleted = true;
        water.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<NutritionDayDto>.Ok(await GetDayAsync(water.DrunkOn));
    }

    private static void Apply(Meal meal, MealRequest request)
    {
        meal.EatenOn = request.EatenOn;
        meal.MealType = request.MealType;
        meal.Description = request.Description.Trim();
        meal.Calories = request.Calories;
        meal.ProteinG = Round(request.ProteinG);
        meal.CarbsG = Round(request.CarbsG);
        meal.FatG = Round(request.FatG);
        meal.Notes = HealthRules.Text(request.Notes);
    }

    private static decimal? Round(decimal? grams) => grams is { } g ? Math.Round(g, 1, MidpointRounding.AwayFromZero) : null;

    private static MealDto ToDto(Meal m) => new()
    {
        Id = m.Id,
        EatenOn = m.EatenOn,
        MealType = m.MealType,
        Description = m.Description,
        Calories = m.Calories,
        ProteinG = m.ProteinG,
        CarbsG = m.CarbsG,
        FatG = m.FatG,
        Notes = m.Notes,
    };
}
