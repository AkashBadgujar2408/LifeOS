using LifeOS.Core.Finance.Services;
using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Habits.Services;
using LifeOS.Core.Shared.DTOs;

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
    IReadOnlyList<ChallengeFact>? Challenges = null,
    ProgressFacts? Progress = null,
    MoneyFacts? Money = null);

/// <summary>Minutes spent on a local day (study, focus).</summary>
public record MinutesFact(DateOnly Day, int Minutes);

public record MediaFinishedFact(string Kind, DateOnly Day);

/// <summary>Career, learning, leisure and tasks facts (Session 96b), on local days.</summary>
public record ProgressFacts(
    IReadOnlyList<DateOnly> Promotions,
    IReadOnlyList<DateOnly> OffersAccepted,
    IReadOnlyList<DateOnly> Certifications,
    IReadOnlyList<DateOnly> CoursesFinished,
    IReadOnlyList<MinutesFact> Study,
    IReadOnlyList<DateOnly> SkillsAtTop,
    IReadOnlyList<MediaFinishedFact> MediaFinished,
    IReadOnlyList<DateOnly> TasksDone,
    IReadOnlyList<MinutesFact> Focus);

/// <summary>Net worth and money in accounts at the end of a day, in the base currency (NetWorth.At).</summary>
public record WealthDayFact(DateOnly Day, decimal Net, decimal Cash);

/// <summary>A month as the cash-flow report counts it; <c>BudgetKept</c> null when the month had no budget.</summary>
public record MoneyMonthFact(DateOnly MonthStart, decimal Income, decimal Spending, bool? BudgetKept = null);

/// <summary>A loan you borrowed: what's still owed today and the day it was cleared (closed or last paid).</summary>
public record DebtFact(decimal Outstanding, DateOnly? ClearedOn);

/// <summary>
/// Finance facts (Session 96b), all in the base currency. <c>InrRate</c> is one INR in it (1 for INR, null without a
/// rate); <c>IncomeCrossedOn</c> is the day a month's income first reached each threshold amount (worked out by the
/// service from the cash-flow report, day by day within the month).
/// </summary>
public record MoneyFacts(
    string Currency,
    decimal? InrRate,
    IReadOnlyList<WealthDayFact> Days,
    IReadOnlyList<MoneyMonthFact> Months,
    IReadOnlyList<DebtFact> Debts,
    IReadOnlyDictionary<decimal, DateOnly> IncomeCrossedOn);

/// <summary>
/// One achievement: unlocked on a day, or locked with how far along it is. <c>Module</c> hides it with that module;
/// <c>Currency</c> says Progress/Target are money; <c>NeedsRate</c> = can't be judged until an INR rate is set.
/// </summary>
public record Achievement(
    string Key,
    string Title,
    string Description,
    string Icon,
    int Progress,
    int Target,
    DateOnly? UnlockedOn,
    string? Module = null,
    string? Currency = null,
    bool NeedsRate = false)
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
            .. Progress(facts.Progress, today),
            .. Money(facts.Money, today),
        ];
    }

    /// <summary>Career, learning, leisure and tasks (Session 96b). Each hides with its module.</summary>
    internal static IEnumerable<Achievement> Progress(ProgressFacts? facts, DateOnly today)
    {
        if (facts is null)
        {
            yield break;
        }

        List<DateOnly> Sorted(IEnumerable<DateOnly> days) => days.Where(d => d <= today).Order().ToList();
        Achievement In(string module, Achievement a) => a with { Module = module };

        yield return In(ModuleKeys.Career, Count("first-promotion", "Moving up", "Got your first promotion.", "bi-graph-up-arrow",
            Sorted(facts.Promotions), 1));
        yield return In(ModuleKeys.Career, Count("offer-accepted", "Said yes", "Accepted a job offer.", "bi-briefcase",
            Sorted(facts.OffersAccepted), 1));
        yield return In(ModuleKeys.Learning, Count("first-certification", "Certified", "Earned your first certification.",
            "bi-patch-check", Sorted(facts.Certifications), 1));
        yield return In(ModuleKeys.Learning, Count("courses-5", "Five courses finished", "Finished five courses.", "bi-mortarboard",
            Sorted(facts.CoursesFinished), 5));
        yield return In(ModuleKeys.Learning, Hours("study-100-hours", "A hundred hours of study", "Studied for a hundred hours in all.",
            "bi-hourglass-split", facts.Study, 100, today));
        yield return In(ModuleKeys.Learning, Count("skill-top", "Could teach it", "Raised a skill to its top level.", "bi-stars",
            Sorted(facts.SkillsAtTop), 1));

        var books = BestYear(facts.MediaFinished.Where(m => m.Kind == "Book").Select(m => m.Day), 12, today);
        yield return In(ModuleKeys.Leisure, new("books-12-year", "A book a month", "Finished twelve books in one calendar year.",
            "bi-book-half", books.Best, 12, books.On));
        yield return In(ModuleKeys.Leisure, Count("media-50", "Fifty finished",
            "Finished fifty books, films, shows, games, albums or podcasts.", "bi-collection-play",
            Sorted(facts.MediaFinished.Select(m => m.Day)), 50));
        yield return In(ModuleKeys.Tasks, Count("tasks-100", "A hundred tasks done", "Completed a hundred tasks.", "bi-check2-square",
            Sorted(facts.TasksDone), 100));
        yield return In(ModuleKeys.Tasks, Hours("focus-50-hours", "Fifty hours of focus", "Spent fifty hours in focus sessions.",
            "bi-stopwatch", facts.Focus, 50, today));
    }

    /// <summary>Unlocked on the day the running total of minutes reached <paramref name="hours"/>; progress in whole hours.</summary>
    private static Achievement Hours(string key, string title, string description, string icon, IEnumerable<MinutesFact> sessions,
        int hours, DateOnly today)
    {
        var total = 0;
        DateOnly? on = null;
        foreach (var day in sessions.Where(s => s.Day <= today).GroupBy(s => s.Day).OrderBy(g => g.Key))
        {
            total += day.Sum(s => s.Minutes);
            if (on is null && total >= hours * 60)
            {
                on = day.Key;
            }
        }

        return new(key, title, description, icon, Math.Min(total / 60, hours), hours, on);
    }

    /// <summary>The most in one calendar year (capped at the target) and the day the earliest year that made it got there.</summary>
    internal static (int Best, DateOnly? On) BestYear(IEnumerable<DateOnly> days, int target, DateOnly today)
    {
        var best = 0;
        DateOnly? on = null;
        foreach (var year in days.Where(d => d <= today).GroupBy(d => d.Year).OrderBy(g => g.Key))
        {
            var sorted = year.Order().ToList();
            best = Math.Max(best, sorted.Count);
            if (on is null && sorted.Count >= target)
            {
                on = sorted[target - 1];
            }
        }

        return (Math.Min(best, target), on);
    }

    /// <summary>
    /// Money (Session 96b), in the base currency. Net worth and month-income thresholds are written in INR and
    /// converted (<see cref="AchievementThresholds"/>); without an INR rate those few show NeedsRate instead of a guess.
    /// </summary>
    internal static IEnumerable<Achievement> Money(MoneyFacts? facts, DateOnly today)
    {
        if (facts is null)
        {
            yield break;
        }

        var currency = facts.Currency;
        Achievement In(Achievement a) => a with { Module = ModuleKeys.Finance };
        var days = facts.Days.Where(d => d.Day <= today).OrderBy(d => d.Day).ToList();
        var months = facts.Months.Where(m => m.MonthStart <= today).OrderBy(m => m.MonthStart).ToList();
        // A month counts for "running" achievements once it's over.
        var finished = months.Where(m => MonthEnd(m.MonthStart) < today).ToList();

        var netWorth = AchievementThresholds.For(AchievementThresholds.NetWorth, currency, facts.InrRate);
        var current = days.Count > 0 ? days[^1].Net : 0;
        foreach (var (key, inr) in AchievementThresholds.NetWorth)
        {
            var threshold = netWorth?.Single(t => t.Key == key);
            var name = threshold?.Label ?? AchievementThresholds.Label(inr, AchievementThresholds.Inr);
            if (threshold is null)
            {
                yield return In(new(key, $"Net worth {name}", $"Your net worth reached {name}.", "bi-graph-up", 0, 0, null, NeedsRate: true));
                continue;
            }

            // Reached once is reached: a later dip doesn't take it away (the day really happened).
            var reachedOn = days.FirstOrDefault(d => d.Net >= threshold.Amount)?.Day;
            yield return In(new(key, $"Net worth {name}", $"Your net worth reached {name}.", "bi-graph-up",
                reachedOn is null ? Whole(Math.Clamp(current, 0, threshold.Amount)) : Whole(threshold.Amount), Whole(threshold.Amount),
                reachedOn, Currency: currency));
        }

        var income = AchievementThresholds.For(AchievementThresholds.MonthIncome, currency, facts.InrRate);
        var bestMonth = months.Count > 0 ? months.Max(m => m.Income) : 0;
        foreach (var (key, inr) in AchievementThresholds.MonthIncome)
        {
            var threshold = income?.Single(t => t.Key == key);
            var name = threshold?.Label ?? AchievementThresholds.Label(inr, AchievementThresholds.Inr);
            if (threshold is null)
            {
                yield return In(new(key, $"A {name} month", $"Earned {name} or more in one calendar month.", "bi-cash-stack", 0, 0, null,
                    NeedsRate: true));
                continue;
            }

            DateOnly? crossedOn = months.Any(m => m.Income >= threshold.Amount)
                && facts.IncomeCrossedOn.TryGetValue(threshold.Amount, out var crossed) && crossed <= today ? crossed : null;
            yield return In(new(key, $"A {name} month", $"Earned {name} or more in one calendar month.", "bi-cash-stack",
                Whole(Math.Min(bestMonth, threshold.Amount)), Whole(threshold.Amount), crossedOn, Currency: currency));
        }

        // Every loan you borrowed paid off, on the day the last one was cleared.
        var debts = facts.Debts;
        var cleared = debts.Count(d => d.Outstanding <= 0);
        var lastCleared = debts.Count > 0 && cleared == debts.Count && debts.All(d => d.ClearedOn is not null)
            ? debts.Max(d => d.ClearedOn!.Value) : (DateOnly?)null;
        yield return In(new("debt-free", "Debt-free", "Paid off every loan you owed.", "bi-unlock",
            cleared, Math.Max(debts.Count, 1), lastCleared <= today ? lastCleared : null));

        var fund = EmergencyFund(days, months, today);
        yield return In(new("emergency-fund", "Safety net", "Money in your accounts covered six months of your average spending.",
            "bi-shield-check", fund.Covered, EmergencyMonths, fund.On));

        var kept = Runs(finished.Where(m => m.BudgetKept is not null).ToList(), m => m.BudgetKept == true, 3);
        yield return In(new("budget-month", "On budget", "Kept every budget for a whole month.", "bi-piggy-bank",
            Math.Min(kept.Best, 1), 1, kept.ReachedOn.GetValueOrDefault(1)));
        yield return In(new("budget-3-months", "Three months on budget", "Kept every budget three months running.", "bi-piggy-bank-fill",
            kept.Best, 3, kept.ReachedOn.GetValueOrDefault(3)));

        var saved = Runs(finished, m => CashFlowSavingsRate(m) >= SavingsRatePercent, 3);
        yield return In(new("saved-20-3-months", "Steady saver", "Saved 20% or more of your income three months running.", "bi-bank",
            saved.Best, 3, saved.ReachedOn.GetValueOrDefault(3)));
    }

    public const int EmergencyMonths = 6;
    public const decimal SavingsRatePercent = 20;

    private static decimal? CashFlowSavingsRate(MoneyMonthFact m) => CashFlowReport.SavingsRate(m.Income, m.Spending);

    private static DateOnly MonthEnd(DateOnly monthStart) => monthStart.AddMonths(1).AddDays(-1);

    private static int Whole(decimal amount) => (int)Math.Min(Math.Floor(amount), int.MaxValue);

    /// <summary>
    /// The longest run of back-to-back calendar months that pass (cap <paramref name="cap"/>), and the last day of the
    /// month on which each run length 1..cap was first reached. A month missing from the list breaks a run.
    /// </summary>
    internal static (int Best, Dictionary<int, DateOnly?> ReachedOn) Runs(
        IReadOnlyList<MoneyMonthFact> months, Func<MoneyMonthFact, bool> passes, int cap)
    {
        var reached = new Dictionary<int, DateOnly?>();
        var run = 0;
        var best = 0;
        DateOnly? previous = null;
        foreach (var month in months.OrderBy(m => m.MonthStart))
        {
            var follows = previous is { } p && p.AddMonths(1) == month.MonthStart;
            run = passes(month) ? (follows ? run + 1 : 1) : 0;
            previous = month.MonthStart;
            best = Math.Max(best, Math.Min(run, cap));
            if (run is > 0 && run <= cap && !reached.ContainsKey(run))
            {
                reached[run] = MonthEnd(month.MonthStart);
            }
        }

        return (best, reached);
    }

    /// <summary>
    /// At the end of a finished month, money in accounts ≥ six times the average spending of the six months ending
    /// with it (six months of history needed, some spending in them). Unlocked on the first such month end; progress
    /// = whole months of spending the accounts cover now (against the latest six finished months).
    /// </summary>
    internal static (int Covered, DateOnly? On) EmergencyFund(IReadOnlyList<WealthDayFact> days, IReadOnlyList<MoneyMonthFact> months,
        DateOnly today)
    {
        var cashOn = days.ToDictionary(d => d.Day, d => d.Cash);
        var finished = months.Where(m => MonthEnd(m.MonthStart) < today).OrderBy(m => m.MonthStart).ToList();
        DateOnly? on = null;
        decimal? latestAverage = null;
        for (var i = EmergencyMonths - 1; i < finished.Count; i++)
        {
            var window = finished.Skip(i - EmergencyMonths + 1).Take(EmergencyMonths).ToList();
            if (window[0].MonthStart.AddMonths(EmergencyMonths - 1) != window[^1].MonthStart)
            {
                continue;
            }

            var average = window.Average(m => m.Spending);
            if (average <= 0)
            {
                continue;
            }

            latestAverage = average;
            var end = MonthEnd(window[^1].MonthStart);
            if (on is null && cashOn.TryGetValue(end, out var cash) && cash >= EmergencyMonths * average)
            {
                on = end;
            }
        }

        var now = days.Count > 0 ? days[^1].Cash : 0;
        var covered = latestAverage is { } avg && now > 0 ? (int)Math.Min(Math.Floor(now / avg), EmergencyMonths) : 0;
        return (on is not null ? EmergencyMonths : covered, on);
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
