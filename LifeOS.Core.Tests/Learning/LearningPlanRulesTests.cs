using LifeOS.Core.Learning.DTOs;
using LifeOS.Core.Learning.Services;

namespace LifeOS.Core.Tests.Learning;

public class LearningPlanRulesTests
{
    private static readonly DateOnly Today = new(2026, 10, 18);

    [Fact]
    public void A_note_put_into_review_comes_back_tomorrow()
    {
        Assert.Equal(new ReviewState(0, Today.AddDays(1), null), RevisionPlanner.Start(Today));
    }

    [Fact]
    public void Each_good_review_waits_longer_1_3_7_14_30_then_stays_at_30()
    {
        var gaps = new List<int>();
        var state = RevisionPlanner.Start(Today);
        var day = Today;
        gaps.Add(state.NextReviewOn!.Value.DayNumber - day.DayNumber);
        for (var i = 0; i < 6; i++)
        {
            day = state.NextReviewOn!.Value;
            state = RevisionPlanner.Review(state.Stage, remembered: true, day);
            gaps.Add(state.NextReviewOn!.Value.DayNumber - day.DayNumber);
        }

        Assert.Equal([1, 3, 7, 14, 30, 30, 30], gaps);
        Assert.Equal(RevisionPlanner.MaxStage, state.Stage);
    }

    [Fact]
    public void Forgetting_starts_the_intervals_again()
    {
        var state = RevisionPlanner.Review(4, remembered: false, Today);

        Assert.Equal(new ReviewState(0, Today.AddDays(1), Today), state);
        Assert.Equal(Today.AddDays(1 + 3), RevisionPlanner.Review(state.Stage, true, Today.AddDays(1)).NextReviewOn);
    }

    [Fact]
    public void A_missed_review_stays_due_until_it_is_done()
    {
        Assert.True(RevisionPlanner.IsDue(Today.AddDays(-5), Today));
        Assert.True(RevisionPlanner.IsDue(Today, Today));
        Assert.False(RevisionPlanner.IsDue(Today.AddDays(1), Today));
        Assert.False(RevisionPlanner.IsDue(null, Today));
    }

    [Fact]
    public void Roadmap_percent_floors_and_a_completed_one_is_100()
    {
        Assert.Equal(66, RoadmapProgress.Percent(RoadmapStatuses.Active, 3, 2));
        Assert.Equal(0, RoadmapProgress.Percent(RoadmapStatuses.Active, 0, 0));
        Assert.Equal(100, RoadmapProgress.Percent(RoadmapStatuses.Completed, 4, 1));
    }

    [Fact]
    public void The_last_step_finishes_a_roadmap_and_unticking_reopens_it()
    {
        Assert.Equal(RoadmapStatuses.Completed, RoadmapProgress.StatusAfterStep(RoadmapStatuses.Active, 3, 3));
        Assert.Null(RoadmapProgress.StatusAfterStep(RoadmapStatuses.Active, 3, 2));
        Assert.Equal(RoadmapStatuses.Active, RoadmapProgress.StatusAfterStep(RoadmapStatuses.Completed, 3, 2));
        // Archived is the user's call; ticking steps doesn't change it.
        Assert.Null(RoadmapProgress.StatusAfterStep(RoadmapStatuses.Archived, 3, 3));
    }
}
