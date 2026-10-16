using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Story.DTOs;
using LifeOS.Core.Story.Services;

namespace LifeOS.Core.Tests.Story;

public class AchievementsTests
{
    private static readonly DateOnly Today = new(2026, 10, 16);

    private static DateOnly D(int month, int day) => new(2026, month, day);

    private static AchievementFacts Facts(
        IReadOnlyList<PassedGoalFact>? goals = null,
        IReadOnlyList<AreaDay>? objectives = null,
        IReadOnlyList<HabitFact>? habits = null,
        IReadOnlyList<AreaDay>? journal = null,
        IReadOnlyList<ChapterFact>? chapters = null,
        IReadOnlyList<DateOnly>? debriefs = null,
        IReadOnlyList<RatingFact>? ratings = null,
        int lifeAreas = 3) =>
        new(Today, lifeAreas, goals ?? [], objectives ?? [], habits ?? [], journal ?? [], chapters ?? [], debriefs ?? [], ratings ?? []);

    private static Achievement Get(AchievementFacts facts, string key) => Achievements.Evaluate(facts).Single(a => a.Key == key);

    [Fact]
    public void Nothing_yet_means_everything_locked_with_no_progress()
    {
        var all = Achievements.Evaluate(Facts());

        Assert.Equal(17, all.Count);
        Assert.All(all, a => Assert.Null(a.UnlockedOn));
        Assert.All(all, a => Assert.Equal(0, a.Progress));
        Assert.Equal(all.Count, all.Select(a => a.Key).Distinct().Count());
    }

    [Fact]
    public void Count_achievements_unlock_on_the_day_of_the_nth_thing()
    {
        var goals = new[]
        {
            new PassedGoalFact(GoalTypes.ShortTerm, 1, D(3, 5)),
            new PassedGoalFact(GoalTypes.LongTerm, 2, D(1, 10)),
            new PassedGoalFact(GoalTypes.BucketList, 1, D(9, 1)),
            new PassedGoalFact(GoalTypes.ShortTerm, 1, D(4, 1)),
        };
        var facts = Facts(goals);

        Assert.Equal(D(1, 10), Get(facts, "first-mission").UnlockedOn);
        Assert.Equal(D(1, 10), Get(facts, "main-mission").UnlockedOn);
        Assert.Equal(D(9, 1), Get(facts, "collectible").UnlockedOn);

        var five = Get(facts, "missions-5");
        Assert.Null(five.UnlockedOn);
        Assert.Equal(4, five.Progress);
        Assert.Equal(5, five.Target);
    }

    [Fact]
    public void Journal_counts_days_not_rows_and_ignores_the_future()
    {
        var journal = Enumerable.Range(1, 10).Select(d => new AreaDay(null, D(10, d))).ToList();
        journal.Add(new AreaDay(1, D(10, 1)));
        journal.Add(new AreaDay(null, D(10, 30)));

        var ten = Get(Facts(journal: journal), "journal-10");

        Assert.Equal(D(10, 10), ten.UnlockedOn);
        Assert.Equal(10, ten.Progress);
    }

    [Fact]
    public void A_streak_unlocks_on_the_day_it_reaches_the_threshold()
    {
        // Every day from 1 Oct; days 1-3 done, 4 missed, then 5-11 done → a 7-run reached on the 11th.
        var done = new[] { 1, 2, 3, 5, 6, 7, 8, 9, 10, 11 }.Select(d => D(10, d)).ToList();
        var habit = new HabitFact(1, 127, D(10, 1), 1, done);

        var week = Get(Facts(habits: [habit]), "streak-7");
        var month = Get(Facts(habits: [habit]), "streak-30");

        Assert.Equal(D(10, 11), week.UnlockedOn);
        Assert.Equal(7, month.Progress);
        Assert.Null(month.UnlockedOn);
    }

    [Fact]
    public void Unscheduled_days_neither_break_nor_extend_a_streak()
    {
        // Mon/Wed/Fri only (1 + 4 + 16). 5 Oct 2026 is a Monday: seven M/W/F sessions run 5 Oct – 19 Oct.
        var days = new[] { 5, 7, 9, 12, 14, 16 }.Select(d => D(10, d)).Append(D(10, 13)).ToList();
        var habit = new HabitFact(1, 1 + 4 + 16, D(10, 5), null, days);
        var facts = Facts(habits: [habit]) with { Today = D(10, 19) };
        var withSeventh = Facts(habits: [habit with { DoneDays = [.. days, D(10, 19)] }]) with { Today = D(10, 19) };

        Assert.Equal(6, Get(facts, "streak-7").Progress);
        Assert.Equal(D(10, 19), Get(withSeventh, "streak-7").UnlockedOn);
    }

    [Fact]
    public void The_earliest_habit_to_reach_a_streak_wins()
    {
        var late = new HabitFact(1, 127, D(9, 1), 1, Enumerable.Range(10, 7).Select(d => D(9, d)).ToList());
        var early = new HabitFact(2, 127, D(8, 1), 2, Enumerable.Range(1, 7).Select(d => D(8, d)).ToList());

        Assert.Equal(D(8, 7), Get(Facts(habits: [late, early]), "streak-7").UnlockedOn);
    }

    [Fact]
    public void Well_rounded_needs_every_area_in_the_same_calendar_month()
    {
        var habit = new HabitFact(1, 127, D(9, 1), 3, [D(9, 30), D(10, 20)]);
        var facts = Facts(
            goals: [new PassedGoalFact(GoalTypes.ShortTerm, 1, D(9, 3))],
            objectives: [new AreaDay(2, D(10, 2))],
            habits: [habit],
            journal: [new AreaDay(1, D(10, 9)), new AreaDay(null, D(10, 1))]);

        // September: areas 1 and 3. October: 2 and 1 so far (the 20 Oct habit day is in the future).
        var rounded = Get(facts, "well-rounded");
        Assert.Null(rounded.UnlockedOn);
        Assert.Equal(2, rounded.Progress);
        Assert.Equal(3, rounded.Target);

        var completed = facts with { JournalDays = [.. facts.JournalDays, new AreaDay(3, D(10, 12))] };
        Assert.Equal(D(10, 12), Get(completed, "well-rounded").UnlockedOn);
    }

    [Fact]
    public void Rating_every_area_unlocks_on_the_day_the_month_was_completed()
    {
        var ratings = new[]
        {
            new RatingFact(1, D(9, 1), D(9, 28)),
            new RatingFact(2, D(9, 1), D(10, 2)),
            new RatingFact(1, D(10, 1), D(10, 15)),
        };

        var partial = Get(Facts(ratings: ratings), "self-rated");
        Assert.Null(partial.UnlockedOn);
        Assert.Equal(2, partial.Progress);

        var full = Get(Facts(ratings: [.. ratings, new RatingFact(3, D(9, 1), D(10, 5))]), "self-rated");
        Assert.Equal(D(10, 5), full.UnlockedOn);
    }

    [Fact]
    public void Chapters_count_when_named_and_when_they_end_but_not_ahead_of_time()
    {
        var facts = Facts(chapters:
        [
            new ChapterFact(new DateOnly(2019, 7, 1), new DateOnly(2023, 6, 30), D(10, 16)),
            new ChapterFact(D(9, 1), D(12, 31), D(10, 14)),
        ]);

        Assert.Equal(D(10, 14), Get(facts, "first-chapter").UnlockedOn);
        Assert.Equal(new DateOnly(2023, 6, 30), Get(facts, "chapter-closed").UnlockedOn);
        Assert.Null(Get(facts with { Chapters = [facts.Chapters[1]] }, "chapter-closed").UnlockedOn);
    }

    [Fact]
    public void Achievement_beats_close_their_day_in_the_story_and_lead_the_recap()
    {
        var passed = new StoryBeatDto { Kind = StoryBeatKinds.MissionPassed, Day = Today, At = new DateTime(2026, 10, 16, 9, 0, 0, DateTimeKind.Utc) };
        var unlocked = new StoryBeatDto { Kind = StoryBeatKinds.AchievementUnlocked, Day = Today, Title = "First mission passed" };

        var section = LifeStoryBuilder.Build([], [unlocked, passed]).Single();

        Assert.Equal([StoryBeatKinds.MissionPassed, StoryBeatKinds.AchievementUnlocked], section.Beats.Select(b => b.Kind));
        Assert.Equal(StoryBeatKinds.AchievementUnlocked, StoryRecap.Recent([passed, unlocked], Today)[0].Kind);
    }

    [Fact]
    public void The_recap_shows_at_most_one_achievement()
    {
        var passed = new StoryBeatDto { Kind = StoryBeatKinds.MissionPassed, Day = Today, At = new DateTime(2026, 10, 16, 9, 0, 0, DateTimeKind.Utc) };
        var older = new StoryBeatDto { Kind = StoryBeatKinds.MilestoneDone, Day = Today.AddDays(-2) };
        StoryBeatDto Unlock(string title) => new() { Kind = StoryBeatKinds.AchievementUnlocked, Day = Today, Title = title };

        var recent = StoryRecap.Recent([Unlock("A"), Unlock("B"), Unlock("C"), passed, older], Today);

        Assert.Equal([StoryBeatKinds.AchievementUnlocked, StoryBeatKinds.MissionPassed, StoryBeatKinds.MilestoneDone], recent.Select(b => b.Kind));
    }
}
