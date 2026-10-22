using LifeOS.Core.Dashboard.DTOs;
using LifeOS.Core.Dashboard.Services;

namespace LifeOS.Core.Tests.Dashboard;

/// <summary>Session 93's rules: study gap (Learning), untagged expenses (Finance), workout gap (Health, counts only).</summary>
public class Session93InsightTests
{
    private static readonly DateOnly Today = new(2026, 10, 22);

    private static List<InsightDto> Evaluate(InsightStudy? study = null, InsightUntagged? untagged = null, InsightWorkouts? workouts = null) =>
        DashboardInsights.Evaluate(new InsightInputs(Today, new DateTime(2026, 10, 22, 9, 0, 0, DateTimeKind.Utc),
            [], [], Today, 0, Study: study, Untagged: untagged, Workouts: workouts));

    [Fact]
    public void Learning_on_the_go_with_two_weeks_of_no_study_is_a_nudge_keyed_by_the_last_day()
    {
        var insight = Assert.Single(Evaluate(study: new InsightStudy(true, new DateOnly(2026, 10, 2))));
        Assert.Equal(InsightKinds.StudyGap, insight.Kind);
        Assert.Equal("StudyGap:2026-10-02", insight.Key);
        Assert.Equal("Study", insight.EntityType);
        Assert.Equal("No study logged since 02/Oct/2026 (20 days). A short session keeps it moving.", insight.Message);

        // A session 13 days ago, nothing on the go, or never studied: nothing to say.
        Assert.Empty(Evaluate(study: new InsightStudy(true, Today.AddDays(-13))));
        Assert.Empty(Evaluate(study: new InsightStudy(false, new DateOnly(2026, 1, 1))));
        Assert.Empty(Evaluate(study: new InsightStudy(true, null)));
    }

    [Fact]
    public void Three_untagged_expenses_this_month_is_one_nudge_for_the_month()
    {
        var insight = Assert.Single(Evaluate(untagged: new InsightUntagged(4)));
        Assert.Equal("UntaggedExpenses:2026-10", insight.Key);
        Assert.Equal("Transactions", insight.EntityType);
        Assert.Equal("4 expenses in October have no tag, so budgets and reports can't place them.", insight.Message);
        Assert.Empty(Evaluate(untagged: new InsightUntagged(2)));
    }

    [Fact]
    public void A_regular_who_hasnt_logged_a_workout_for_a_week_gets_a_neutral_nudge()
    {
        var insight = Assert.Single(Evaluate(workouts: new InsightWorkouts(new DateOnly(2026, 10, 13), 6)));
        Assert.Equal("WorkoutGap:2026-10-13", insight.Key);
        Assert.Equal("Fitness", insight.EntityType);
        Assert.Equal("No workout logged for 9 days. A short one counts too.", insight.Message);

        // Six days, or only three workouts in 60 days (not a regular): nothing.
        Assert.Empty(Evaluate(workouts: new InsightWorkouts(Today.AddDays(-6), 10)));
        Assert.Empty(Evaluate(workouts: new InsightWorkouts(Today.AddDays(-20), 3)));
    }
}
