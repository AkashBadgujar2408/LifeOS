using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Goals.Services;
using LifeOS.Core.Health.Services;

namespace LifeOS.Core.Tests.Health;

public class WorkoutGoalRulesTests
{
    private static readonly DateOnly Oct1 = new(2026, 10, 1);

    private static GoalSourceRef Source(string? kind, string metric, DateOnly countsFrom) =>
        new(7, 1, GoalSourceKinds.Workouts, null, null, kind, metric, countsFrom);

    private static readonly WorkoutFigures[] Workouts =
    [
        new("Walk", new(2026, 9, 30), 60, 7000, 5.0m),   // before counting starts
        new("Walk", new(2026, 10, 2), 45, 6000, 4.2m),
        new("Walk", new(2026, 10, 2), 30, 4000, null),   // same day: added up
        new("Run", new(2026, 10, 3), 50, 9000, 10.0m),
        new("Walk", new(2026, 10, 4), 20, null, 1.5m),   // no steps logged: adds nothing to steps
        new("Yoga", new(2026, 10, 5), 40, null, null),
    ];

    [Fact]
    public void Walk_steps_add_up_walks_only_from_the_day_counting_starts()
    {
        var amounts = WorkoutGoalRules.Amounts(Source("Walk", GoalSourceMetrics.Steps, Oct1), Workouts).ToList();

        Assert.Equal([(new DateOnly(2026, 10, 2), 10000m)], amounts.Select(a => (a.Day, a.Amount)));
        Assert.All(amounts, a => Assert.Equal(7, a.SourceId));
    }

    [Fact]
    public void A_run_counts_toward_km_of_runs_not_toward_walk_steps()
    {
        var runKm = WorkoutGoalRules.Amounts(Source("Run", GoalSourceMetrics.DistanceKm, Oct1), Workouts).Sum(a => a.Amount);
        var walkSteps = WorkoutGoalRules.Amounts(Source("Walk", GoalSourceMetrics.Steps, Oct1), Workouts).Sum(a => a.Amount);

        Assert.Equal(10m, runKm);
        Assert.Equal(10000m, walkSteps);
    }

    [Fact]
    public void Any_workout_counts_every_kind()
    {
        var minutes = WorkoutGoalRules.Amounts(Source(null, GoalSourceMetrics.Minutes, Oct1), Workouts).Sum(a => a.Amount);
        var km = WorkoutGoalRules.Amounts(Source(null, GoalSourceMetrics.DistanceKm, Oct1), Workouts).Sum(a => a.Amount);

        Assert.Equal(45 + 30 + 50 + 20 + 40, minutes);
        Assert.Equal(4.2m + 10.0m + 1.5m, km);
    }

    [Theory]
    [InlineData("Walk", GoalSourceMetrics.Steps, null)]
    [InlineData(null, GoalSourceMetrics.Steps, null)]
    [InlineData("Swim", GoalSourceMetrics.DistanceKm, null)]
    [InlineData("Yoga", GoalSourceMetrics.Minutes, null)]
    [InlineData("Swim", GoalSourceMetrics.Steps, "Swim workouts don't record steps.")]
    [InlineData("Yoga", GoalSourceMetrics.DistanceKm, "Yoga workouts don't record km.")]
    [InlineData("Dance", GoalSourceMetrics.Minutes, "Choose a kind of workout.")]
    [InlineData("Walk", null, "Choose steps, km or minutes.")]
    [InlineData("Walk", "Calories", "Choose steps, km or minutes.")]
    public void Only_figures_a_kind_records_can_be_counted(string? kind, string? metric, string? expected)
    {
        Assert.Equal(expected, WorkoutGoalRules.Check(kind, metric));
    }

    [Fact]
    public void Every_option_passes_the_check_and_reads_plainly()
    {
        Assert.All(WorkoutGoalRules.Options, o => Assert.Null(WorkoutGoalRules.Check(o.Kind, o.Metric)));
        Assert.Equal(3 + 5 + 9, WorkoutGoalRules.Options.Count);
        Assert.Equal("Walk workouts: steps", WorkoutGoalRules.Title("Walk", GoalSourceMetrics.Steps));
        Assert.Equal("Any workout: km", WorkoutGoalRules.Title(null, GoalSourceMetrics.DistanceKm));
    }
}
