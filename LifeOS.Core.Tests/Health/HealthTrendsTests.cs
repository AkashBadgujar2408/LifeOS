using LifeOS.Core.Health.DTOs;
using LifeOS.Core.Health.Services;

namespace LifeOS.Core.Tests.Health;

public class HealthTrendsTests
{
    // Monday 19 Oct 2026.
    private static readonly DateOnly Today = new(2026, 10, 19);
    private static DateOnly D(int day, int month = 10) => new(2026, month, day);

    [Fact]
    public void Weekly_minutes_add_up_by_iso_week_with_empty_weeks_kept()
    {
        var weeks = HealthTrends.Weeks(
            [(D(5), 30, 4000), (D(11), 45, null), (D(12), 20, 2500), (D(18), 60, 8000), (Today, 25, null)],
            Today,
            3);

        Assert.Equal([D(5), D(12), D(19)], weeks.Select(w => w.WeekStart));
        // 5-11 Oct: the 5th and the 11th (a Sunday). 12-18 Oct: the 12th and 18th. This week: today.
        Assert.Equal([75, 80, 25], weeks.Select(w => w.Minutes));
        Assert.Equal([2, 2, 1], weeks.Select(w => w.Sessions));
        Assert.Equal([4000, 10500, 0], weeks.Select(w => w.Steps));

        var quiet = HealthTrends.Weeks([], Today, 2);
        Assert.All(quiet, w => Assert.Equal(0, w.Minutes));
    }

    [Fact]
    public void A_night_is_the_main_sleeps_of_one_morning_and_naps_stay_out()
    {
        var nights = HealthTrends.Nights(
        [
            (D(18), 420, (byte?)4, false),
            (D(19), 300, (byte?)2, false), // woke at 3, back to sleep...
            (D(19), 90, (byte?)3, false), // ...for another 90 minutes
            (D(19), 30, null, true), // a nap
        ]);

        Assert.Equal([D(18), D(19)], nights.Select(n => n.WokeOn));
        Assert.Equal([420, 390], nights.Select(n => n.Minutes));
        Assert.Equal([(byte?)4, (byte?)3], nights.Select(n => n.Quality)); // 2.5 rounds up
    }

    [Fact]
    public void Sleep_averages_are_per_night_logged_in_the_window()
    {
        SleepNightDto Night(DateOnly day, int minutes, byte? quality = null) => new() { WokeOn = day, Minutes = minutes, Quality = quality };
        var nights = new List<SleepNightDto>
        {
            Night(D(1), 300, 1), // outside 7 days, inside 30
            Night(D(14), 480, 4),
            Night(D(17), 400),
            Night(Today, 420, 5),
        };

        Assert.Equal(433, HealthTrends.AverageMinutes(nights, Today, 7)); // (480+400+420)/3 = 433.3
        Assert.Equal(400, HealthTrends.AverageMinutes(nights, Today, 30));
        Assert.Equal(3.3m, HealthTrends.AverageQuality(nights, Today, 30)); // (1+4+5)/3
        Assert.Equal(3, HealthTrends.NightsLogged(nights, Today, 7));
        Assert.Null(HealthTrends.AverageMinutes([], Today, 7));
        Assert.Null(HealthTrends.AverageQuality([Night(Today, 400)], Today, 7));
    }

    [Fact]
    public void Nutrition_days_never_count_an_unknown_as_zero()
    {
        var days = HealthTrends.NutritionDays(
            [(D(17), 450), (D(17), null), (D(18), null), (D(19), 300), (D(19), 700)],
            [(D(17), 250), (D(17), 500), (D(19), 1000)],
            D(17),
            D(19));

        Assert.Equal([450, null, 1000], days.Select(d => d.Calories));
        Assert.Equal([750, 0, 1000], days.Select(d => d.WaterMl));
        Assert.Equal([2, 1, 2], days.Select(d => d.Meals));
    }

    [Fact]
    public void The_latest_of_each_kind_comes_with_its_change()
    {
        var latest = HealthTrends.Latest(
        [
            new MeasurementDto { Id = 1, Kind = "Weight", MeasuredOn = D(1), Value = 82.4m },
            new MeasurementDto { Id = 2, Kind = "Weight", MeasuredOn = D(15), Value = 80.9m },
            new MeasurementDto { Id = 3, Kind = "BloodPressure", MeasuredOn = D(10), Value = 128, Value2 = 84 },
            new MeasurementDto { Id = 4, Kind = "Weight", MeasuredOn = D(8), Value = 81.5m },
        ]);

        Assert.Equal(["Weight", "BloodPressure"], latest.Select(l => l.Kind)); // the kinds' own order
        Assert.Equal(80.9m, latest[0].Latest.Value);
        Assert.Equal(-0.6m, latest[0].Change);
        Assert.Equal(D(8), latest[0].PreviousOn);
        Assert.Equal(3, latest[0].Count);
        Assert.Null(latest[1].Change);
        Assert.Equal("mmHg", latest[1].Unit);
    }

    [Fact]
    public void Logs_are_checked_like_the_database_checks_them()
    {
        var now = new DateTime(2026, 10, 19, 6, 0, 0, DateTimeKind.Utc);
        SleepRequest Sleep(DateTime start, DateTime end, byte? quality = null) =>
            new() { WokeOn = Today, StartedAt = start, EndedAt = end, Quality = quality, Today = Today };
        var bed = new DateTime(2026, 10, 18, 17, 30, 0, DateTimeKind.Utc);

        Assert.Null(HealthLogRules.CheckSleep(Sleep(bed, bed.AddHours(7.5), 4), now));
        Assert.NotNull(HealthLogRules.CheckSleep(Sleep(bed, bed), now));
        Assert.NotNull(HealthLogRules.CheckSleep(Sleep(bed, bed.AddHours(25)), now));
        Assert.NotNull(HealthLogRules.CheckSleep(Sleep(now, now.AddHours(1)), now)); // ends in the future
        Assert.NotNull(HealthLogRules.CheckSleep(Sleep(bed, bed.AddHours(7), 6), now));
        Assert.NotNull(HealthLogRules.CheckSleep(Sleep(DateTime.SpecifyKind(bed, DateTimeKind.Unspecified), bed.AddHours(7)), now));

        MeasurementRequest M(string kind, decimal value, decimal? value2 = null) =>
            new() { Kind = kind, MeasuredOn = Today, Value = value, Value2 = value2, Today = Today };
        Assert.Null(HealthLogRules.CheckMeasurement(M("Weight", 80.9m)));
        Assert.Null(HealthLogRules.CheckMeasurement(M("BloodPressure", 120, 80)));
        Assert.NotNull(HealthLogRules.CheckMeasurement(M("Weight", 809)));
        Assert.NotNull(HealthLogRules.CheckMeasurement(M("BloodPressure", 120)));
        Assert.NotNull(HealthLogRules.CheckMeasurement(M("BloodPressure", 80, 120)));
        Assert.NotNull(HealthLogRules.CheckMeasurement(M("Weight", 80, 1)));
        Assert.NotNull(HealthLogRules.CheckMeasurement(M("Height", 170)));
        Assert.NotNull(HealthLogRules.CheckMeasurement(new MeasurementRequest { Kind = "Weight", Value = 80, MeasuredOn = Today.AddDays(1), Today = Today }));

        WorkoutRequest W(int minutes, string kind = "Run") => new() { Kind = kind, OccurredOn = Today, Minutes = minutes, Today = Today };
        Assert.Null(HealthLogRules.CheckWorkout(W(30)));
        Assert.NotNull(HealthLogRules.CheckWorkout(W(0)));
        Assert.NotNull(HealthLogRules.CheckWorkout(W(30, "Dance")));
        Assert.NotNull(HealthLogRules.CheckWorkout(new WorkoutRequest { Kind = "Walk", OccurredOn = Today.AddDays(1), Minutes = 30, Today = Today }));

        Assert.Null(HealthLogRules.CheckWater(new WaterRequest { DrunkOn = Today, Millilitres = 250, Today = Today }));
        Assert.NotNull(HealthLogRules.CheckWater(new WaterRequest { DrunkOn = Today, Millilitres = 6000, Today = Today }));
        Assert.Null(HealthLogRules.CheckMeal(new MealRequest { EatenOn = Today, MealType = "Lunch", Description = "Dal rice", Calories = 550, Today = Today }));
        Assert.NotNull(HealthLogRules.CheckMeal(new MealRequest { EatenOn = Today, MealType = "Brunch", Description = "Eggs", Today = Today }));
        Assert.NotNull(HealthLogRules.CheckMeal(new MealRequest { EatenOn = Today, MealType = "Lunch", Description = " ", Today = Today }));
    }
}
