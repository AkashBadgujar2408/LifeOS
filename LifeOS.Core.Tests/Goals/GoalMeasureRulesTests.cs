using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Goals.Services;

namespace LifeOS.Core.Tests.Goals;

public class GoalMeasureRulesTests
{
    [Fact]
    public void No_measure_at_all_is_fine()
    {
        Assert.Null(GoalMeasureRules.CheckMeasure(null, null, null, null));
        Assert.Null(GoalMeasureRules.CheckMeasure(null, null, "  ", null));
    }

    [Theory]
    [InlineData(null, 0d, "steps", GoalMeasureSources.Manual, "Give the number to reach.")]
    [InlineData(100000d, 0d, "steps", null, "Choose whether you log the number or it's counted from other items.")]
    [InlineData(100000d, 0d, "steps", "Sometimes", "Choose whether you log the number or it's counted from other items.")]
    [InlineData(0d, 0d, "steps", GoalMeasureSources.Manual, "The number to reach has to be more than zero.")]
    [InlineData(100000d, -5d, "steps", GoalMeasureSources.Manual, "What's already done can't be below zero.")]
    [InlineData(100000d, 100000d, "steps", GoalMeasureSources.Manual, "What's already done has to be less than the number to reach.")]
    public void A_partial_or_impossible_measure_is_refused_in_words(
        double? target, double? start, string? unit, string? source, string expected)
    {
        Assert.Equal(expected, GoalMeasureRules.CheckMeasure((decimal?)target, (decimal?)start, unit, source));
    }

    [Fact]
    public void A_measure_needs_a_unit()
    {
        Assert.Equal("Say what it's measured in — steps, km, pages, hours…",
            GoalMeasureRules.CheckMeasure(100_000, 0, " ", GoalMeasureSources.Manual));
        Assert.Equal("Keep the unit to 30 characters.",
            GoalMeasureRules.CheckMeasure(10, 0, new string('x', 31), GoalMeasureSources.Manual));
    }

    [Fact]
    public void A_whole_measure_passes_and_start_defaults_to_nothing_done()
    {
        Assert.Null(GoalMeasureRules.CheckMeasure(100_000, null, "steps", GoalMeasureSources.Linked));
        Assert.Null(GoalMeasureRules.CheckMeasure(2000, 300, "pages", GoalMeasureSources.Manual));
    }

    [Fact]
    public void Units_match_whatever_the_case_and_spacing()
    {
        Assert.True(GoalMeasureRules.SameUnit("Steps", " steps "));
        Assert.True(GoalMeasureRules.SameUnit("km  run", "KM run"));
        Assert.False(GoalMeasureRules.SameUnit("pages", "steps"));
        Assert.Equal("km run", GoalMeasureRules.Unit("  km   run "));
    }

    [Fact]
    public void Entries_are_positive_and_not_ahead_of_today()
    {
        var today = new DateOnly(2026, 10, 20);
        Assert.Null(GoalMeasureRules.CheckEntry(today, 8000, today));
        Assert.Null(GoalMeasureRules.CheckEntry(today.AddDays(-30), 0.5m, today));
        Assert.Equal("That day hasn't come yet.", GoalMeasureRules.CheckEntry(today.AddDays(1), 8000, today));
        Assert.Equal("Log an amount more than zero.", GoalMeasureRules.CheckEntry(today, 0, today));
        Assert.Equal("Log an amount more than zero.", GoalMeasureRules.CheckEntry(today, -10, today));
    }

    [Theory]
    [InlineData(GoalSourceKinds.Habit, "Habit", 3, null, null, null)]
    [InlineData(GoalSourceKinds.Habit, "Skill", 3, null, null, "That item can't be counted that way.")]
    [InlineData(GoalSourceKinds.StudyTime, "Course", 3, null, null, null)]
    [InlineData(GoalSourceKinds.BooksFinished, null, null, null, null, null)]
    [InlineData(GoalSourceKinds.BooksFinished, "Skill", 3, null, null, null)]
    [InlineData(GoalSourceKinds.Roadmap, "Roadmap", 3, null, null, null)]
    [InlineData(GoalSourceKinds.ProjectFocus, "Project", 3, null, null, null)]
    [InlineData(GoalSourceKinds.Workouts, null, null, "Walk", GoalSourceMetrics.Steps, null)]
    [InlineData(GoalSourceKinds.Workouts, null, null, null, null, "That item can't be counted that way.")]
    [InlineData(GoalSourceKinds.Habit, "Habit", 3, "Walk", null, "Only workouts take a kind and a figure.")]
    [InlineData(GoalSourceKinds.Habit, "Habit", null, null, null, "Choose the item it's counted from.")]
    [InlineData("Vibes", null, null, null, null, "Choose what the goal is counted from.")]
    public void Source_shapes_mirror_the_database_check(
        string kind, string? entityType, int? entityId, string? filter, string? metric, string? expected)
    {
        Assert.Equal(expected, GoalSourceRules.CheckShape(kind, entityType, entityId, filter, metric));
    }

    [Fact]
    public void A_roadmap_is_a_goals_only_source()
    {
        Assert.Null(GoalSourceRules.CheckAlongside(GoalSourceKinds.Habit, [GoalSourceKinds.Habit]));
        Assert.Null(GoalSourceRules.CheckAlongside(GoalSourceKinds.Roadmap, []));
        Assert.NotNull(GoalSourceRules.CheckAlongside(GoalSourceKinds.Roadmap, [GoalSourceKinds.StudyTime]));
        Assert.NotNull(GoalSourceRules.CheckAlongside(GoalSourceKinds.Habit, [GoalSourceKinds.Roadmap]));
    }
}
