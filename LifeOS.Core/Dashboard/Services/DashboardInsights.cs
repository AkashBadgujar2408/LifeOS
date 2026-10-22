using LifeOS.Core.Dashboard.DTOs;
using LifeOS.Core.Habits.Services;
using static System.FormattableString;

namespace LifeOS.Core.Dashboard.Services;

/// <summary>What the insight rules look at: a slice of the My Day data, plus the clock (passed in, for tests).</summary>
public record InsightInputs(
    DateOnly Today,
    DateTime NowUtc,
    IReadOnlyList<InsightHabit> Habits,
    IReadOnlyList<InsightGoal> Goals,
    DateOnly? LatestJournalDate,
    int OverdueTaskCount,
    IReadOnlyList<InsightDocument>? ExpiringDocuments = null,
    IReadOnlyList<InsightBudget>? OverBudgets = null,
    IReadOnlyList<InsightLowBalance>? LowBalances = null,
    IReadOnlyList<InsightKeepInTouch>? KeepInTouch = null,
    InsightStudy? Study = null,
    InsightUntagged? Untagged = null,
    InsightWorkouts? Workouts = null);

public record InsightHabit(int Id, string Title, byte ScheduleDays, DateOnly StartDate, IReadOnlyCollection<DateOnly> DoneDates, HabitStreak Streak);

/// <summary>An active goal. Kind/Percent are its progress (GoalProgress); the measure says what "reached" was.</summary>
public record InsightGoal(
    int Id, string Title, DateTime LastActivityAt, string ProgressKind = "Milestones", int ProgressPercent = 0,
    bool ProgressLocked = false, decimal? MeasureTarget = null, string? MeasureUnit = null, bool CountedFromItems = false);

public record InsightDocument(int Id, string Title, DateOnly ExpiresOn);

/// <summary>A tag past its budget this month (spent and budget in the same currency).</summary>
public record InsightBudget(int TagId, string TagName, decimal Spent, decimal Budget, string Currency);

/// <summary>An account the cash-flow forecast says will drop below zero, the first day it does, and how low it is then.</summary>
public record InsightLowBalance(int AccountId, string Name, string Currency, DateOnly Day, decimal Balance);

/// <summary>Someone with a keep-in-touch cadence (Family): when you were last in touch and when the next touch is due.</summary>
public record InsightKeepInTouch(int ContactId, string Name, DateOnly? LastContactedOn, DateOnly DueOn);

/// <summary>Learning on the go (a course in progress or a skill below its target) and the last day anything was studied.</summary>
public record InsightStudy(bool LearningOnTheGo, DateOnly? LastStudiedOn);

/// <summary>This month's expenses with no tag at all.</summary>
public record InsightUntagged(int Count);

/// <summary>Only counts and a day — what My Day may read from Health without the unlock.</summary>
public record InsightWorkouts(DateOnly? LastWorkoutOn, int WorkoutsLast60Days);

/// <summary>
/// The lightweight, deterministic "insights" (plan, Section 2 #6 — no AI): a handful of plain rules over data the
/// dashboard already has. Pure, so every rule is unit-tested; nothing is stored — the list is worked out per request
/// and disappears by itself once the situation changes. Nudges come first, then the good news.
/// </summary>
public static class DashboardInsights
{
    public const int GoalUntouchedDays = 14;
    public const int JournalGapDays = 5;
    public const int OverdueTasksThreshold = 3;

    /// <summary>A document this close to expiry (or expired, within My Day's 30-day look-back) earns a nudge.</summary>
    public const int DocumentNudgeDays = 30;

    /// <summary>At most this many keep-in-touch nudges a day (the longest past due).</summary>
    public const int KeepInTouchNudges = 3;

    /// <summary>Days without study (while learning is on the go) before a nudge.</summary>
    public const int StudyGapDays = 14;

    /// <summary>Untagged expenses this month before a nudge.</summary>
    public const int UntaggedExpensesThreshold = 3;

    /// <summary>Days without a workout before a nudge — only for someone with at least WorkoutRegularCount in 60 days.</summary>
    public const int WorkoutGapDays = 7;
    public const int WorkoutRegularCount = 4;

    /// <summary>Streak lengths worth a word of congratulation.</summary>
    public static readonly IReadOnlySet<int> StreakMilestones = new HashSet<int> { 7, 14, 21, 30, 50, 100, 200, 365 };

    public static List<InsightDto> Evaluate(InsightInputs inputs)
    {
        var insights = new List<InsightDto>();

        foreach (var habit in inputs.Habits)
        {
            if (JustBroke(habit, inputs.Today) is { } missedDay)
            {
                insights.Add(new InsightDto
                {
                    Kind = InsightKinds.HabitStreakBroken,
                    Key = Invariant($"{InsightKinds.HabitStreakBroken}:{habit.Id}:{missedDay:yyyy-MM-dd}"),
                    Tone = InsightTones.Nudge,
                    Message = $"Your \"{habit.Title}\" streak broke on {missedDay.DayOfWeek}. Today is a good day to pick it back up.",
                    EntityType = "Habit",
                    EntityId = habit.Id,
                });
            }
        }

        // A goal counted from other items (habits, study…) moves by itself, so it's never "untouched".
        foreach (var goal in inputs.Goals.Where(g => !g.CountedFromItems))
        {
            var idleDays = (int)(inputs.NowUtc - goal.LastActivityAt).TotalDays;
            if (idleDays >= GoalUntouchedDays)
            {
                insights.Add(new InsightDto
                {
                    Kind = InsightKinds.GoalUntouched,
                    Key = Invariant($"{InsightKinds.GoalUntouched}:{goal.Id}:{goal.LastActivityAt:yyyy-MM-ddTHH:mm:ss}"),
                    Tone = InsightTones.Nudge,
                    Message = $"\"{goal.Title}\" hasn't moved in {idleDays} days. Add a next step, or postpone it honestly.",
                    EntityType = "Goal",
                    EntityId = goal.Id,
                });
            }
        }

        // Only once there is a journal to lapse from: the My Day journal card already invites a first entry.
        if (inputs.LatestJournalDate is { } lastEntry)
        {
            var gap = inputs.Today.DayNumber - lastEntry.DayNumber;
            if (gap >= JournalGapDays)
            {
                insights.Add(new InsightDto
                {
                    Kind = InsightKinds.JournalGap,
                    Key = Invariant($"{InsightKinds.JournalGap}:{lastEntry:yyyy-MM-dd}"),
                    Tone = InsightTones.Nudge,
                    Message = $"No journal entry for {gap} days. A line or just a mood keeps the thread going.",
                    EntityType = "Journal",
                });
            }
        }

        if (inputs.OverdueTaskCount >= OverdueTasksThreshold)
        {
            insights.Add(new InsightDto
            {
                Kind = InsightKinds.OverdueTasks,
                Key = Invariant($"{InsightKinds.OverdueTasks}:{inputs.OverdueTaskCount}"),
                Tone = InsightTones.Nudge,
                Message = $"{inputs.OverdueTaskCount} tasks are overdue. Reschedule or drop a few so today's list means something.",
                EntityType = "Tasks",
            });
        }

        // Only the soonest: several expiring papers are one job ("sort out renewals"), and the My Day card lists them all.
        if (inputs.ExpiringDocuments?
                .Where(d => d.ExpiresOn.DayNumber - inputs.Today.DayNumber <= DocumentNudgeDays)
                .OrderBy(d => d.ExpiresOn)
                .FirstOrDefault() is { } document)
        {
            insights.Add(new InsightDto
            {
                Kind = InsightKinds.DocumentExpiring,
                Key = Invariant($"{InsightKinds.DocumentExpiring}:{document.Id}:{document.ExpiresOn:yyyy-MM-dd}"),
                Tone = InsightTones.Nudge,
                Message = DocumentExpiryMessage(document, inputs.Today),
                EntityType = "Document",
                EntityId = document.Id,
            });
        }

        // The fullest first; keyed by the month, so it clears itself when the budget is raised or the month turns.
        foreach (var budget in (inputs.OverBudgets ?? []).OrderByDescending(b => b.Spent / b.Budget))
        {
            insights.Add(new InsightDto
            {
                Kind = InsightKinds.OverBudget,
                Key = Invariant($"{InsightKinds.OverBudget}:{budget.TagId}:{inputs.Today:yyyy-MM}"),
                Tone = InsightTones.Nudge,
                Message = OverBudgetMessage(budget, inputs.Today),
                EntityType = "Budgets",
            });
        }

        // Keyed by the account and the day it would go below zero: a change that moves the day (or lifts the balance)
        // makes it a different situation — or clears it.
        foreach (var low in (inputs.LowBalances ?? []).OrderBy(l => l.Day))
        {
            insights.Add(new InsightDto
            {
                Kind = InsightKinds.LowBalanceAhead,
                Key = Invariant($"{InsightKinds.LowBalanceAhead}:{low.AccountId}:{low.Day:yyyy-MM-dd}"),
                Tone = InsightTones.Nudge,
                Message = LowBalanceMessage(low),
                EntityType = "Forecast",
            });
        }

        // The longest past due first, at most a few so My Day stays calm. Keyed by the day it fell due, which moves as
        // soon as you're in touch again (or the cadence changes) — so it clears itself.
        foreach (var person in (inputs.KeepInTouch ?? []).Where(k => k.DueOn < inputs.Today).OrderBy(k => k.DueOn).Take(KeepInTouchNudges))
        {
            insights.Add(new InsightDto
            {
                Kind = InsightKinds.KeepInTouch,
                Key = Invariant($"{InsightKinds.KeepInTouch}:{person.ContactId}:{person.DueOn:yyyy-MM-dd}"),
                Tone = InsightTones.Nudge,
                Message = Family.Services.KeepInTouchRules.Nudge(person.Name, person.LastContactedOn, inputs.Today),
                EntityType = "Contact",
                EntityId = person.ContactId,
            });
        }

        // Keyed by the last study day: logging a session moves it (and the gap closes), so the nudge clears itself.
        if (inputs.Study is { LearningOnTheGo: true, LastStudiedOn: { } lastStudied }
            && inputs.Today.DayNumber - lastStudied.DayNumber >= StudyGapDays)
        {
            insights.Add(new InsightDto
            {
                Kind = InsightKinds.StudyGap,
                Key = Invariant($"{InsightKinds.StudyGap}:{lastStudied:yyyy-MM-dd}"),
                Tone = InsightTones.Nudge,
                Message = StudyGapMessage(lastStudied, inputs.Today),
                EntityType = "Study",
            });
        }

        // One per month: tagging them (or the month turning) clears it.
        if (inputs.Untagged is { Count: >= UntaggedExpensesThreshold } untagged)
        {
            insights.Add(new InsightDto
            {
                Kind = InsightKinds.UntaggedExpenses,
                Key = Invariant($"{InsightKinds.UntaggedExpenses}:{inputs.Today:yyyy-MM}"),
                Tone = InsightTones.Nudge,
                Message = UntaggedMessage(untagged.Count, inputs.Today),
                EntityType = "Transactions",
            });
        }

        // Keyed by the last workout day; logging one clears it. Neutral wording — My Day shows without the vault.
        if (inputs.Workouts is { LastWorkoutOn: { } lastWorkout, WorkoutsLast60Days: >= WorkoutRegularCount }
            && inputs.Today.DayNumber - lastWorkout.DayNumber >= WorkoutGapDays)
        {
            insights.Add(new InsightDto
            {
                Kind = InsightKinds.WorkoutGap,
                Key = Invariant($"{InsightKinds.WorkoutGap}:{lastWorkout:yyyy-MM-dd}"),
                Tone = InsightTones.Nudge,
                Message = Invariant($"No workout logged for {inputs.Today.DayNumber - lastWorkout.DayNumber} days. A short one counts too."),
                EntityType = "Fitness",
            });
        }

        foreach (var habit in inputs.Habits.Where(h => h.Streak.DoneToday && StreakMilestones.Contains(h.Streak.Current)))
        {
            insights.Add(new InsightDto
            {
                Kind = InsightKinds.HabitStreakMilestone,
                Key = Invariant($"{InsightKinds.HabitStreakMilestone}:{habit.Id}:{habit.Streak.Current}"),
                Tone = InsightTones.Cheer,
                Message = $"{habit.Streak.Current} in a row on \"{habit.Title}\". Nicely done.",
                EntityType = "Habit",
                EntityId = habit.Id,
            });
        }

        // A number reached (or a savings amount saved) on a goal that's still Active: never completed by itself, so
        // ask. Gone once it's completed; a new target makes a new key.
        foreach (var goal in inputs.Goals.Where(TargetReached))
        {
            insights.Add(new InsightDto
            {
                Kind = InsightKinds.GoalTargetReached,
                Key = Invariant($"{InsightKinds.GoalTargetReached}:{goal.Id}:{goal.ProgressKind}:{goal.MeasureTarget}"),
                Tone = InsightTones.Cheer,
                Message = TargetReachedMessage(goal),
                EntityType = "Goal",
                EntityId = goal.Id,
            });
        }

        return insights;
    }

    /// <summary>"No study logged since 02/Oct/2026 (20 days). A short session keeps it moving."</summary>
    public static string StudyGapMessage(DateOnly lastStudied, DateOnly today) =>
        Invariant($"No study logged since {lastStudied.ToString("dd/MMM/yyyy", System.Globalization.CultureInfo.InvariantCulture)} ({today.DayNumber - lastStudied.DayNumber} days). A short session keeps it moving.");

    /// <summary>"4 expenses in October have no tag, so budgets and reports can't place them."</summary>
    public static string UntaggedMessage(int count, DateOnly today) =>
        Invariant($"{count} expenses in {today.ToString("MMMM", System.Globalization.CultureInfo.InvariantCulture)} have no tag, so budgets and reports can't place them.");

    /// <summary>Only a goal measured by a number or an amount "reaches" something; milestones finish on their own.</summary>
    private static bool TargetReached(InsightGoal goal) =>
        goal.ProgressPercent >= 100 && !goal.ProgressLocked
        && goal.ProgressKind is Goals.Services.GoalProgressKinds.Measure or Goals.Services.GoalProgressKinds.Savings;

    /// <summary>"You've reached 100,000 steps on "Walk 100k". Mark it complete?"</summary>
    public static string TargetReachedMessage(InsightGoal goal) =>
        goal.ProgressKind == Goals.Services.GoalProgressKinds.Measure && goal.MeasureTarget is { } target
            ? Invariant($"You've reached {Amount(target)} {goal.MeasureUnit} on \"{goal.Title}\". Mark it complete?")
            : $"You've saved what \"{goal.Title}\" needed. Mark it complete?";

    /// <summary>"Groceries has gone past its October budget: 9,250 INR of 8,000. Worth a look before the month is out."</summary>
    public static string OverBudgetMessage(InsightBudget budget, DateOnly today)
    {
        var month = today.ToString("MMMM", System.Globalization.CultureInfo.InvariantCulture);
        return Invariant(
            $"\"{budget.TagName}\" has gone past its {month} budget: {Amount(budget.Spent)} {budget.Currency} of {Amount(budget.Budget)}. Worth a look before the month is out.");
    }

    /// <summary>How far ahead the forecast looks for an account dropping below zero.</summary>
    public const int LowBalanceDays = 60;

    /// <summary>"HDFC Savings could go below zero around 15/Nov/2026 (−2,300 INR then), with what's planned to go out."</summary>
    public static string LowBalanceMessage(InsightLowBalance low) =>
        Invariant(
            $"{low.Name} could go below zero around {low.Day.ToString("dd'/'MMM'/'yyyy", System.Globalization.CultureInfo.InvariantCulture)} ({(low.Balance < 0 ? "−" : string.Empty)}{Amount(Math.Abs(low.Balance))} {low.Currency} then), with what's already planned to go out. A transfer in time would cover it.");

    /// <summary>"9,250" for a whole amount, "1,650.50" otherwise (invariant, like every insight).</summary>
    private static string Amount(decimal value) =>
        value.ToString(value == decimal.Truncate(value) ? "#,0" : "#,0.00", System.Globalization.CultureInfo.InvariantCulture);

    /// <summary>The nudge for a document close to (or just past) its expiry.</summary>
    public static string DocumentExpiryMessage(InsightDocument document, DateOnly today)
    {
        var days = document.ExpiresOn.DayNumber - today.DayNumber;
        return days switch
        {
            < -1 => $"\"{document.Title}\" expired {-days} days ago. Renewing it now saves a scramble later.",
            -1 => $"\"{document.Title}\" expired yesterday. Renewing it now saves a scramble later.",
            0 => $"\"{document.Title}\" expires today.",
            1 => $"\"{document.Title}\" expires tomorrow.",
            _ => $"\"{document.Title}\" expires in {days} days. Renewals take time, so it's worth starting now.",
        };
    }

    /// <summary>
    /// The streak broke *just now*: the latest scheduled day before today was missed, and the scheduled day before
    /// that was done (so there was a streak to lose). Returns the missed day. An older miss is old news — the habit
    /// either recovered or has simply lapsed, and repeating the same nudge every day helps nobody.
    /// </summary>
    public static DateOnly? JustBroke(InsightHabit habit, DateOnly today)
    {
        // Already picked back up today: the nudge has done its job.
        if (habit.DoneDates.Contains(today))
        {
            return null;
        }

        var missed = PreviousScheduledDay(habit, today);
        if (missed is null || habit.DoneDates.Contains(missed.Value))
        {
            return null;
        }

        var before = PreviousScheduledDay(habit, missed.Value);
        return before is not null && habit.DoneDates.Contains(before.Value) ? missed : null;
    }

    // The latest scheduled day strictly before `day`, not before the start date. A schedule always has at least one
    // weekday, so a week back is far enough.
    private static DateOnly? PreviousScheduledDay(InsightHabit habit, DateOnly day)
    {
        for (var candidate = day.AddDays(-1); candidate >= habit.StartDate && candidate >= day.AddDays(-7); candidate = candidate.AddDays(-1))
        {
            if (HabitStreaks.IsScheduled(habit.ScheduleDays, candidate))
            {
                return candidate;
            }
        }

        return null;
    }
}
