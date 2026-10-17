using LifeOS.Core.Dashboard.DTOs;
using LifeOS.Core.Habits.Services;

namespace LifeOS.Core.Dashboard.Services;

/// <summary>What the insight rules look at: a slice of the My Day data, plus the clock (passed in, for tests).</summary>
public record InsightInputs(
    DateOnly Today,
    DateTime NowUtc,
    IReadOnlyList<InsightHabit> Habits,
    IReadOnlyList<InsightGoal> Goals,
    DateOnly? LatestJournalDate,
    int OverdueTaskCount,
    IReadOnlyList<InsightDocument>? ExpiringDocuments = null);

public record InsightHabit(int Id, string Title, byte ScheduleDays, DateOnly StartDate, IReadOnlyCollection<DateOnly> DoneDates, HabitStreak Streak);

public record InsightGoal(int Id, string Title, DateTime LastActivityAt);

public record InsightDocument(int Id, string Title, DateOnly ExpiresOn);

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
                    Tone = InsightTones.Nudge,
                    Message = $"Your \"{habit.Title}\" streak broke on {missedDay.DayOfWeek}. Today is a good day to pick it back up.",
                    EntityType = "Habit",
                    EntityId = habit.Id,
                });
            }
        }

        foreach (var goal in inputs.Goals)
        {
            var idleDays = (int)(inputs.NowUtc - goal.LastActivityAt).TotalDays;
            if (idleDays >= GoalUntouchedDays)
            {
                insights.Add(new InsightDto
                {
                    Kind = InsightKinds.GoalUntouched,
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
                Tone = InsightTones.Nudge,
                Message = DocumentExpiryMessage(document, inputs.Today),
                EntityType = "Document",
                EntityId = document.Id,
            });
        }

        foreach (var habit in inputs.Habits.Where(h => h.Streak.DoneToday && StreakMilestones.Contains(h.Streak.Current)))
        {
            insights.Add(new InsightDto
            {
                Kind = InsightKinds.HabitStreakMilestone,
                Tone = InsightTones.Cheer,
                Message = $"{habit.Streak.Current} in a row on \"{habit.Title}\". Nicely done.",
                EntityType = "Habit",
                EntityId = habit.Id,
            });
        }

        return insights;
    }

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
