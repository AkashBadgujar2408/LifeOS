using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Habits.Services;

namespace LifeOS.Core.Story.Services;

/// <summary>Something finished on a local day, in a life area (null when the source has none).</summary>
public record AreaDay(int? LifeAreaId, DateOnly Day);

public record PassedGoalFact(string GoalType, int LifeAreaId, DateOnly Day);

public record HabitFact(int Id, byte ScheduleDays, DateOnly StartDate, int? LifeAreaId, IReadOnlyCollection<DateOnly> DoneDays);

public record ChapterFact(DateOnly Start, DateOnly? End, DateOnly CreatedOn);

public record RatingFact(int LifeAreaId, DateOnly Month, DateOnly CreatedOn);

/// <summary>A habit challenge and what it's judged on: the build habit's done days come from <see cref="HabitFact"/>; an avoid habit's slips are here.</summary>
public record ChallengeFact(int HabitId, int Days, DateOnly StartDate, bool Avoid, byte ScheduleDays, DateOnly HabitStartDate,
    IReadOnlyCollection<DateOnly> Slips);

/// <summary>
/// Everything achievements are judged on, already on the user's local days (the service converts UTC moments with
/// their timezone).
/// </summary>
public record AchievementFacts(
    DateOnly Today,
    int LifeAreaCount,
    IReadOnlyList<PassedGoalFact> GoalsPassed,
    IReadOnlyList<AreaDay> ObjectivesDone,
    IReadOnlyList<HabitFact> Habits,
    IReadOnlyList<AreaDay> JournalDays,
    IReadOnlyList<ChapterFact> Chapters,
    IReadOnlyList<DateOnly> DebriefDays,
    IReadOnlyList<RatingFact> Ratings,
    IReadOnlyList<ChallengeFact>? Challenges = null);

/// <summary>One achievement: unlocked on a day, or locked with how far along it is.</summary>
public record Achievement(
    string Key,
    string Title,
    string Description,
    string Icon,
    int Progress,
    int Target,
    DateOnly? UnlockedOn)
{
    public bool Unlocked => UnlockedOn is not null;
}

/// <summary>
/// Story Mode's achievements: computed from real data on every request, never stored (so deleting the goal that
/// earned one takes it away again — nothing is faked). Each unlock has the local day it was earned, so it can take
/// its place in the Life Story. Pure and unit-tested. Keys are stable identifiers: never rename one.
///
/// No penalties: nothing here is lost for a missed day, and locked achievements only show progress, never a deadline.
/// </summary>
public static class Achievements
{
    public static IReadOnlyList<Achievement> Evaluate(AchievementFacts facts)
    {
        var today = facts.Today;
        var passed = facts.GoalsPassed.Where(g => g.Day <= today).OrderBy(g => g.Day).ToList();
        var passedDays = passed.Select(g => g.Day).ToList();
        var objectiveDays = facts.ObjectivesDone.Where(o => o.Day <= today).Select(o => o.Day).Order().ToList();
        var journalDays = facts.JournalDays.Where(j => j.Day <= today).Select(j => j.Day).Distinct().Order().ToList();
        var debriefDays = facts.DebriefDays.Where(d => d <= today).Order().ToList();
        var chapterNamed = facts.Chapters.Select(c => c.CreatedOn).Where(d => d <= today).Order().ToList();
        var chapterClosed = facts.Chapters
            .Where(c => c.End is { } end && end <= today)
            .Select(c => c.End!.Value)
            .Order()
            .ToList();
        var streak = Streaks(facts.Habits, today, [7, 30, 100]);
        var rounded = WellRounded(facts, today);
        var rated = FullyRated(facts, today);
        var challenges = ChallengesFinished(facts, today);

        return
        [
            Count("first-mission", "First mission passed", "Completed your first goal.", "bi-trophy", passedDays, 1),
            Count("missions-5", "Five missions passed", "Completed five goals.", "bi-trophy", passedDays, 5),
            Count("missions-25", "Twenty-five missions passed", "Completed twenty-five goals.", "bi-trophy-fill", passedDays, 25),
            Count("main-mission", "The main storyline", "Completed a long-term goal — a main mission.", "bi-star-fill",
                passed.Where(g => g.GoalType == GoalTypes.LongTerm).Select(g => g.Day).ToList(), 1),
            Count("collectible", "Collector", "Ticked off a bucket-list goal.", "bi-gem",
                passed.Where(g => g.GoalType == GoalTypes.BucketList).Select(g => g.Day).ToList(), 1),
            Count("objectives-10", "Ten objectives", "Ticked ten milestones.", "bi-check2-circle", objectiveDays, 10),
            Count("objectives-50", "Fifty objectives", "Ticked fifty milestones.", "bi-check2-all", objectiveDays, 50),
            Streak("streak-7", "A week strong", "Kept a habit for seven scheduled days in a row.", streak, 7),
            Streak("streak-30", "A month strong", "Kept a habit for thirty scheduled days in a row.", streak, 30),
            Streak("streak-100", "A hundred days strong", "Kept a habit for a hundred scheduled days in a row.", streak, 100),
            Count("challenge-7", "Seven days, done", "Finished a 7-day habit challenge.", "bi-flag",
                challenges.Where(c => c.Days >= 7).Select(c => c.On).Order().ToList(), 1),
            Count("challenge-30", "Thirty days, done", "Finished a 30-day habit challenge.", "bi-flag-fill",
                challenges.Where(c => c.Days >= 30).Select(c => c.On).Order().ToList(), 1),
            Count("challenge-90", "Ninety days, done", "Finished a 90-day habit challenge.", "bi-award-fill",
                challenges.Where(c => c.Days >= 90).Select(c => c.On).Order().ToList(), 1),
            Count("journal-10", "Ten pages", "Wrote in your journal on ten days.", "bi-journal-text", journalDays, 10),
            Count("journal-100", "A hundred pages", "Wrote in your journal on a hundred days.", "bi-journal-bookmark", journalDays, 100),
            Count("debrief", "Lessons learned", "Wrote your first mission debrief.", "bi-chat-quote", debriefDays, 1),
            Count("first-chapter", "Once upon a time", "Named a chapter of your life.", "bi-book", chapterNamed, 1),
            Count("chapter-closed", "Turned the page", "Closed a chapter of your life.", "bi-bookmark-check", chapterClosed, 1),
            new("well-rounded", "Well-rounded month", "Did something in every life area within one calendar month.",
                "bi-pie-chart", rounded.Best, facts.LifeAreaCount, rounded.On),
            new("self-rated", "An honest look", "Rated every life area for a month.", "bi-clipboard-heart",
                rated.Best, facts.LifeAreaCount, rated.On),
        ];
    }

    /// <summary>Unlocked on the day the <paramref name="target"/>-th thing happened (days sorted oldest first).</summary>
    private static Achievement Count(string key, string title, string description, string icon, IReadOnlyList<DateOnly> sortedDays, int target) =>
        new(key, title, description, icon, Math.Min(sortedDays.Count, target), target,
            sortedDays.Count >= target ? sortedDays[target - 1] : null);

    private static Achievement Streak(string key, string title, string description, StreakFacts streak, int target) =>
        new(key, title, description, "bi-fire", Math.Min(streak.Longest, target), target,
            streak.ReachedOn.TryGetValue(target, out var on) ? on : null);

    internal record StreakFacts(int Longest, Dictionary<int, DateOnly> ReachedOn);

    /// <summary>Every finished challenge (any habit) with its length and the day it finished, through HabitChallenges.</summary>
    internal static List<(int Days, DateOnly On)> ChallengesFinished(AchievementFacts facts, DateOnly today)
    {
        var doneByHabit = facts.Habits.ToDictionary(h => h.Id, h => h.DoneDays.ToHashSet());
        var finished = new List<(int Days, DateOnly On)>();
        foreach (var c in facts.Challenges ?? [])
        {
            var logged = c.Avoid ? c.Slips.ToHashSet() : doneByHabit.GetValueOrDefault(c.HabitId) ?? [];
            var progress = HabitChallenges.Evaluate(c.Days, c.StartDate, c.Avoid, c.ScheduleDays, c.HabitStartDate, logged, today);
            if (progress.CompletedOn is { } on)
            {
                finished.Add((c.Days, on));
            }
        }

        return finished;
    }

    /// <summary>
    /// The longest run of scheduled days done (any habit), and the first day any habit's run reached each threshold.
    /// Same rules as HabitStreaks: only scheduled days on/after the start count; unscheduled days neither break nor
    /// extend a run.
    /// </summary>
    internal static StreakFacts Streaks(IEnumerable<HabitFact> habits, DateOnly today, int[] thresholds)
    {
        var longest = 0;
        var reachedOn = new Dictionary<int, DateOnly>();
        foreach (var habit in habits)
        {
            var done = habit.DoneDays.Where(d => d >= habit.StartDate && d <= today).ToHashSet();
            if (done.Count == 0)
            {
                continue;
            }

            var run = 0;
            var last = done.Max();
            for (var day = habit.StartDate; day <= last; day = day.AddDays(1))
            {
                if (!HabitStreaks.IsScheduled(habit.ScheduleDays, day))
                {
                    continue;
                }

                run = done.Contains(day) ? run + 1 : 0;
                longest = Math.Max(longest, run);
                foreach (var threshold in thresholds)
                {
                    if (run == threshold && (!reachedOn.TryGetValue(threshold, out var earlier) || day < earlier))
                    {
                        reachedOn[threshold] = day;
                    }
                }
            }
        }

        return new StreakFacts(longest, reachedOn);
    }

    /// <summary>
    /// Every life area touched (a goal passed, an objective, a habit day or a journal entry filed under it) within one
    /// calendar month: unlocked on the day the last area was touched, in the earliest month that managed it.
    /// </summary>
    internal static (int Best, DateOnly? On) WellRounded(AchievementFacts facts, DateOnly today)
    {
        if (facts.LifeAreaCount == 0)
        {
            return (0, null);
        }

        var habitArea = facts.Habits.ToDictionary(h => h.Id, h => h.LifeAreaId);
        var touches = facts.GoalsPassed.Select(g => new AreaDay(g.LifeAreaId, g.Day))
            .Concat(facts.ObjectivesDone)
            .Concat(facts.Habits.SelectMany(h => h.DoneDays.Select(d => new AreaDay(habitArea[h.Id], d))))
            .Concat(facts.JournalDays)
            .Where(t => t.LifeAreaId is not null && t.Day <= today);

        var best = 0;
        DateOnly? on = null;
        foreach (var month in touches.GroupBy(t => ChapterRules.MonthStart(t.Day)))
        {
            // The first day each area was touched that month; the month is complete on the latest of those.
            var firstTouch = month.GroupBy(t => t.LifeAreaId).Select(area => area.Min(t => t.Day)).ToList();
            best = Math.Max(best, firstTouch.Count);
            if (firstTouch.Count >= facts.LifeAreaCount && (on is null || firstTouch.Max() < on))
            {
                on = firstTouch.Max();
            }
        }

        return (Math.Min(best, facts.LifeAreaCount), on);
    }

    /// <summary>Every life area rated for one month: unlocked on the day the last of that month's ratings was given.</summary>
    internal static (int Best, DateOnly? On) FullyRated(AchievementFacts facts, DateOnly today)
    {
        if (facts.LifeAreaCount == 0)
        {
            return (0, null);
        }

        var best = 0;
        DateOnly? on = null;
        foreach (var month in facts.Ratings.Where(r => r.CreatedOn <= today).GroupBy(r => r.Month))
        {
            var areas = month.Select(r => r.LifeAreaId).Distinct().Count();
            best = Math.Max(best, areas);
            var completedOn = month.Max(r => r.CreatedOn);
            if (areas >= facts.LifeAreaCount && (on is null || completedOn < on))
            {
                on = completedOn;
            }
        }

        return (Math.Min(best, facts.LifeAreaCount), on);
    }
}
