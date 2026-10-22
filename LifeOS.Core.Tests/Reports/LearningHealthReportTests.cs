using LifeOS.Core.Learning.Services;
using LifeOS.Core.Reports.DTOs;
using LifeOS.Core.Reports.Services;

namespace LifeOS.Core.Tests.Reports;

public class LearningReportTests
{
    private static readonly DateOnly From = new(2026, 9, 1);
    private static readonly DateOnly To = new(2026, 9, 30);
    private static DateOnly D(int month, int day) => new(2026, month, day);

    [Fact]
    public void Subjects_group_like_the_study_chart_and_every_one_is_listed()
    {
        var rows = new StudyWeekRow[]
        {
            new(D(8, 31), "Skill", 1, "Spanish", 120),
            new(D(9, 7), "Skill", 1, "Spanish", 60),
            new(D(9, 7), "Topic", null, "statistics", 30),
            new(D(9, 14), "Topic", null, "Statistics", 30), // topics group whatever their case
            new(D(9, 14), "Course", 4, null, 60),           // its course was deleted
        };
        var days = new StudyDayFact[] { new(D(9, 1), 2, 120), new(D(9, 8), 2, 90), new(D(9, 15), 2, 90) };

        var report = LearningReport.Build(rows, days, [], From, To, D(9, 20));

        Assert.Equal(300, report.TotalMinutes);
        Assert.Equal((6, 3), (report.Sessions, report.ActiveDays));
        Assert.Equal(["Spanish", StudyAnalytics.RemovedName, "statistics"], report.Subjects.Select(s => s.Name));
        Assert.Equal([180, 60, 60], report.Subjects.Select(s => s.Minutes));
        Assert.Equal(60, report.Subjects[0].Percent);
        Assert.Equal([120, 90, 90], report.Weeks.Select(w => w.Minutes));
    }

    [Fact]
    public void What_was_reached_is_counted_by_kind_oldest_first()
    {
        var reached = new LearningReachedDto[]
        {
            new() { Kind = LearningReachedKinds.SkillLevelUp, Id = 1, Title = "Spanish", Day = D(9, 20), Detail = "2 → 3" },
            new() { Kind = LearningReachedKinds.CourseCompleted, Id = 2, Title = "Stats 101", Day = D(9, 3) },
            new() { Kind = LearningReachedKinds.BookFinished, Id = 3, Title = "Thinking in Bets", Day = D(9, 10) },
        };

        var report = LearningReport.Build([], [], reached, From, To, D(9, 30));

        Assert.Equal(["Stats 101", "Thinking in Bets", "Spanish"], report.Reached.Select(r => r.Title));
        Assert.Equal((1, 1, 1, 0), (report.CoursesCompleted, report.BooksFinished, report.LevelUps, report.Certifications));
        Assert.Equal(0, report.TotalMinutes);
    }
}

public class HealthReportTests
{
    private static readonly DateOnly From = new(2026, 9, 1);
    private static readonly DateOnly To = new(2026, 9, 30);
    private static DateOnly D(int month, int day) => new(2026, month, day);

    [Fact]
    public void Workout_totals_add_only_the_steps_and_km_given()
    {
        var report = HealthReport.Build(
            [new(D(9, 1), "Run", 30, 4000, 5m), new(D(9, 1), "Yoga", 45, null, null), new(D(9, 3), "Run", 25, null, 4.2m)],
            [], [], [], From, To, D(9, 30));

        Assert.Equal((3, 100, 2), (report.Workouts.Sessions, report.Workouts.Minutes, report.Workouts.ActiveDays));
        Assert.Equal(4000, report.Workouts.Steps);
        Assert.Equal(9.2m, report.Workouts.DistanceKm);
        Assert.Equal(["Run", "Yoga"], report.Workouts.Kinds.Select(k => k.Kind));
        Assert.Null(report.Workouts.Kinds[1].DistanceKm);

        var none = HealthReport.Build([new(D(9, 2), "Yoga", 20, null, null)], [], [], [], From, To, D(9, 30));
        Assert.Null(none.Workouts.Steps); // unknown, not zero
    }

    [Fact]
    public void Sleep_is_per_night_without_naps_and_a_split_night_is_one()
    {
        var report = HealthReport.Build([],
            [new(D(9, 2), 300, 4, false), new(D(9, 2), 120, 2, false), new(D(9, 2), 30, null, true), new(D(9, 3), 400, null, false)],
            [], [], From, To, D(9, 30));

        Assert.Equal(2, report.Sleep.Nights);
        Assert.Equal(410, report.Sleep.AverageMinutes); // (420 + 400) / 2
        Assert.Equal(3.0m, report.Sleep.AverageQuality); // one rated night: (4 + 2) / 2
    }

    [Fact]
    public void Body_change_is_last_minus_first_and_wellbeing_averages_the_days_with_a_value()
    {
        var report = HealthReport.Build([], [],
            [new("Weight", D(9, 20), 80.4m, null), new("Weight", D(9, 1), 82m, null), new("BloodPressure", D(9, 5), 120m, 80m)],
            [new(D(9, 1), 2, 4, 5), new(D(9, 2), 4, null, null), new(D(9, 3), null, null, 3)],
            From, To, D(9, 30));

        var weight = report.Body.Single(b => b.Kind == "Weight");
        Assert.Equal(("kg", 2, -1.6m), (weight.Unit, weight.Readings, weight.Change));
        Assert.Equal(D(9, 1), weight.FirstOn);
        var pressure = report.Body.Single(b => b.Kind == "BloodPressure");
        Assert.Equal((0m, 0m), (pressure.Change, pressure.Change2));

        Assert.Equal(2, report.Wellbeing.CheckIns);
        Assert.Equal(3.0m, report.Wellbeing.AverageStress);
        Assert.Equal(4.0m, report.Wellbeing.AverageEnergy);
        Assert.Equal((2, 4.0m), (report.Wellbeing.MoodDays, report.Wellbeing.AverageMood));
        Assert.Equal(3.0m, report.Weeks[0].AverageStress); // 31 Aug week: the 1st and 2nd
    }
}
