using LifeOS.Core.Goals.Services;
using LifeOS.Core.Learning.Services;
using LifeOS.Core.Tasks.DTOs;

namespace LifeOS.Core.Tests.Goals;

public class MilestoneLinksTests
{
    [Fact]
    public void A_milestone_following_a_task_is_done_exactly_when_the_task_is()
    {
        Assert.True(MilestoneLinks.TaskDone(TaskStatuses.Done));
        Assert.False(MilestoneLinks.TaskDone(TaskStatuses.Open));
    }

    [Theory]
    [InlineData(ProjectStatuses.Active, 10, 10, true)]   // every task done
    [InlineData(ProjectStatuses.Active, 10, 7, false)]
    [InlineData(ProjectStatuses.Active, 0, 0, false)]    // nothing to finish yet
    [InlineData(ProjectStatuses.Completed, 0, 0, true)]  // marked Completed
    [InlineData(ProjectStatuses.Completed, 4, 1, true)]
    [InlineData(ProjectStatuses.Archived, 3, 1, false)]
    public void A_milestone_following_a_project_is_done_when_it_is_completed_or_all_its_tasks_are(
        string status, int tasks, int done, bool expected)
    {
        Assert.Equal(expected, MilestoneLinks.ProjectDone(status, tasks, done));
    }

    [Fact]
    public void Study_minutes_count_as_hours_to_two_decimals()
    {
        Assert.Equal(1.5m, LearningGoalSources.Hours(90));
        Assert.Equal(0.33m, LearningGoalSources.Hours(20));
        Assert.Equal(0m, LearningGoalSources.Hours(0));
    }
}
