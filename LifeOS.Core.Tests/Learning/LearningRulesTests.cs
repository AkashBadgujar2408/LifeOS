using LifeOS.Core.Learning.DTOs;
using LifeOS.Core.Learning.Services;

namespace LifeOS.Core.Tests.Learning;

public class LearningRulesTests
{
    private static readonly DateOnly Today = new(2026, 10, 18);

    private static DateOnly D(int month, int day) => new(2026, month, day);

    [Fact]
    public void Completing_a_course_fills_in_today_and_100_percent()
    {
        var (state, error) = LearningRules.Course(CourseStatuses.Completed, 70, D(9, 1), null, Today);

        Assert.Null(error);
        Assert.Equal(new CourseState(CourseStatuses.Completed, 100, D(9, 1), Today), state);
    }

    [Fact]
    public void Starting_a_course_dates_it_and_leaving_completed_clears_the_day()
    {
        Assert.Equal(Today, LearningRules.Course(CourseStatuses.InProgress, 10, null, null, Today).State!.StartedOn);
        Assert.Null(LearningRules.Course(CourseStatuses.InProgress, 90, D(9, 1), D(10, 1), Today).State!.CompletedOn);
        Assert.Null(LearningRules.Course(CourseStatuses.Planned, 0, null, null, Today).State!.StartedOn);
    }

    [Fact]
    public void A_course_cant_end_before_it_began()
    {
        Assert.NotNull(LearningRules.Course(CourseStatuses.Completed, 100, D(10, 10), D(10, 1), Today).Error);
    }
}
