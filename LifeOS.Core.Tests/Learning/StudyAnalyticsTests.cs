using LifeOS.Core.Learning.DTOs;
using LifeOS.Core.Learning.Services;

namespace LifeOS.Core.Tests.Learning;

public class StudyAnalyticsTests
{
    private static readonly DateOnly Monday = new(2026, 10, 12);

    [Fact]
    public void Weeks_end_with_the_one_holding_today()
    {
        var weeks = StudyAnalytics.WeekStarts(new DateOnly(2026, 10, 18), 3);
        Assert.Equal([new DateOnly(2026, 9, 28), new DateOnly(2026, 10, 5), Monday], weeks);
    }

    [Fact]
    public void Every_week_is_present_and_subjects_come_most_studied_first()
    {
        var weeks = StudyAnalytics.WeekStarts(Monday, 3);
        var result = StudyAnalytics.Build(weeks,
        [
            new StudyWeekRow(Monday, StudySubjectKinds.Skill, 1, "Spanish", 30),
            new StudyWeekRow(Monday.AddDays(-14), StudySubjectKinds.Skill, 2, "Angular", 90),
            new StudyWeekRow(Monday.AddDays(-14), StudySubjectKinds.Skill, 1, "Spanish", 45),
            // Outside the window: ignored.
            new StudyWeekRow(Monday.AddDays(-21), StudySubjectKinds.Skill, 1, "Spanish", 500),
        ]);

        Assert.Equal(["Angular", "Spanish"], result.Subjects.Select(s => s.Name));
        Assert.Equal([90, 0, 0], result.Subjects[0].MinutesByWeek);
        Assert.Equal([45, 0, 30], result.Subjects[1].MinutesByWeek);
        Assert.Equal(165, result.TotalMinutes);
    }

    [Fact]
    public void Topics_group_regardless_of_case_and_removed_subjects_get_a_name()
    {
        var result = StudyAnalytics.Build([Monday],
        [
            new StudyWeekRow(Monday, StudySubjectKinds.Topic, null, "Subjunctive", 20),
            new StudyWeekRow(Monday, StudySubjectKinds.Topic, null, "subjunctive", 10),
            new StudyWeekRow(Monday, StudySubjectKinds.Topic, null, null, 5),
        ]);

        Assert.Equal(2, result.Subjects.Count);
        Assert.Equal(30, result.Subjects[0].TotalMinutes);
        Assert.Equal(StudyAnalytics.RemovedName, result.Subjects[1].Name);
    }

    [Fact]
    public void Past_the_top_five_the_rest_fold_into_everything_else_but_never_just_one()
    {
        StudyWeekRow Row(int id, int minutes) => new(Monday, StudySubjectKinds.Course, id, $"Course {id}", minutes);

        var six = StudyAnalytics.Build([Monday], [.. Enumerable.Range(1, 6).Select(i => Row(i, i * 10))]);
        Assert.Equal(6, six.Subjects.Count);
        Assert.DoesNotContain(six.Subjects, s => s.Kind == StudySubjectKinds.Other);

        var seven = StudyAnalytics.Build([Monday], [.. Enumerable.Range(1, 7).Select(i => Row(i, i * 10))]);
        Assert.Equal(6, seven.Subjects.Count);
        var other = seven.Subjects[^1];
        Assert.Equal(StudySubjectKinds.Other, other.Kind);
        Assert.Equal(10 + 20, other.TotalMinutes);
        Assert.Equal(280, seven.TotalMinutes);
    }
}
