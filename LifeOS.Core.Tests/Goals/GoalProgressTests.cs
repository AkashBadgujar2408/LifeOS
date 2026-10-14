using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Goals.Services;

namespace LifeOS.Core.Tests.Goals;

public class GoalProgressTests
{
    [Theory]
    [InlineData(GoalStatuses.Active, 0, 0, 0)]
    [InlineData(GoalStatuses.Active, 3, 1, 33)]
    [InlineData(GoalStatuses.Active, 3, 2, 66)]
    [InlineData(GoalStatuses.Active, 3, 3, 100)]
    [InlineData(GoalStatuses.Active, 200, 199, 99)] // floored: never shows 100% while something is left
    [InlineData(GoalStatuses.Completed, 0, 0, 100)]
    [InlineData(GoalStatuses.Completed, 4, 1, 100)]
    [InlineData(GoalStatuses.Postponed, 4, 2, 50)]
    public void Percent_is_floored_share_of_done_milestones_and_completed_goals_are_full(
        string status, int milestones, int done, int expected)
    {
        Assert.Equal(expected, GoalProgress.Percent(status, milestones, done));
    }
}
