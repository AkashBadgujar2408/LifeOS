using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Story.DTOs;
using LifeOS.Core.Story.Services;

namespace LifeOS.Core.Tests.Story;

public class LifeAreaLevelsTests
{
    [Fact]
    public void Xp_weighs_finishing_more_than_ticking()
    {
        Assert.Equal(50, LifeAreaLevels.Xp(1, 0, 0, 0));
        Assert.Equal(30, LifeAreaLevels.Xp(0, 1, 0, 0));
        Assert.Equal(10, LifeAreaLevels.Xp(0, 0, 1, 0));
        Assert.Equal(10, LifeAreaLevels.Xp(0, 0, 0, 1));
        Assert.Equal(2 * 50 + 3 * 30 + 7 * 10 + 4 * 10, LifeAreaLevels.Xp(2, 3, 7, 4));
    }

    [Theory]
    [InlineData(1, 0)]
    [InlineData(2, 100)]
    [InlineData(3, 300)]
    [InlineData(4, 600)]
    [InlineData(5, 1000)]
    [InlineData(10, 4500)]
    public void Each_level_step_is_longer_than_the_last(int level, int xp)
    {
        Assert.Equal(xp, LifeAreaLevels.XpToReach(level));
    }

    [Fact]
    public void Nothing_yet_is_level_one_with_the_first_step_ahead()
    {
        Assert.Equal(new LifeAreaLevel(0, 1, 0, 100), LifeAreaLevels.For(0));
    }

    [Fact]
    public void Reaching_a_threshold_exactly_is_the_new_level()
    {
        Assert.Equal(new LifeAreaLevel(99, 1, 99, 100), LifeAreaLevels.For(99));
        Assert.Equal(new LifeAreaLevel(100, 2, 0, 200), LifeAreaLevels.For(100));
        Assert.Equal(new LifeAreaLevel(1050, 5, 50, 500), LifeAreaLevels.For(1050));
    }

    [Fact]
    public void Negative_xp_is_treated_as_none()
    {
        Assert.Equal(LifeAreaLevels.For(0), LifeAreaLevels.For(-20));
    }
}

public class StoryRecapTests
{
    private static readonly DateOnly Today = new(2026, 10, 16);

    private static StoryBeatDto Beat(string title, DateOnly day, DateTime? at = null) =>
        new() { Kind = StoryBeatKinds.MilestoneDone, Title = title, Day = day, At = at };

    private static MissionDto Mission(int id, string kind, string status = GoalStatuses.Active, DateOnly? target = null, bool locked = false) =>
        new()
        {
            Id = id,
            Title = $"Mission {id}",
            Kind = kind,
            Status = status,
            TargetDate = target,
            CreatedAt = new DateTime(2026, 1, 1).AddDays(id),
            BlockedBy = locked ? [new MissionRefDto { Id = 99 }] : [],
        };

    [Fact]
    public void Recent_beats_are_newest_first_and_skip_the_future()
    {
        var beats = new[]
        {
            Beat("old", Today.AddDays(-30)),
            Beat("habit next week", Today.AddDays(7)),
            Beat("yesterday", Today.AddDays(-1)),
            Beat("today morning", Today, new DateTime(2026, 10, 16, 3, 0, 0, DateTimeKind.Utc)),
            Beat("today evening", Today, new DateTime(2026, 10, 16, 14, 0, 0, DateTimeKind.Utc)),
            Beat("today, no time", Today),
        };

        var recent = StoryRecap.Recent(beats, Today);

        Assert.Equal(["today evening", "today morning", "today, no time"], recent.Select(b => b.Title));
    }

    [Fact]
    public void The_current_mission_prefers_an_unlocked_main_mission_with_the_nearest_target()
    {
        var missions = new[]
        {
            Mission(1, MissionKinds.Side, target: new DateOnly(2026, 10, 20)),
            Mission(2, MissionKinds.Main, target: new DateOnly(2027, 6, 1)),
            Mission(3, MissionKinds.Main, target: new DateOnly(2026, 12, 1), locked: true),
            Mission(4, MissionKinds.Main),
            Mission(5, MissionKinds.Main, GoalStatuses.Postponed, new DateOnly(2026, 11, 1)),
            Mission(6, MissionKinds.Main, GoalStatuses.Completed, new DateOnly(2026, 11, 1)),
        };

        Assert.Equal(2, StoryRecap.CurrentMission(missions)?.Id);
    }

    [Fact]
    public void Without_a_main_mission_a_side_one_then_a_collectible_is_current()
    {
        Assert.Equal(1, StoryRecap.CurrentMission([Mission(7, MissionKinds.Collectible), Mission(1, MissionKinds.Side)])?.Id);
        Assert.Equal(7, StoryRecap.CurrentMission([Mission(7, MissionKinds.Collectible)])?.Id);
        Assert.Null(StoryRecap.CurrentMission([Mission(8, MissionKinds.Main, GoalStatuses.Abandoned)]));
    }
}
