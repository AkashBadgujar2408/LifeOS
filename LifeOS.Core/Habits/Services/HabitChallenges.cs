namespace LifeOS.Core.Habits.Services;

/// <summary>Matches what <see cref="HabitChallenges.Evaluate"/> returns. "Broken" is shown gently ("not this time").</summary>
public static class ChallengeStates
{
    public const string Active = "Active";
    public const string Completed = "Completed";
    public const string Broken = "Broken";
}

/// <summary>Where a challenge stands: how many of its days are done so far, of how many, and when it finished.</summary>
public record ChallengeProgress(string State, int DaysDone, int DaysTotal, DateOnly EndDate, DateOnly? CompletedOn);

/// <summary>
/// Habit challenges (7 / 30 / 90 days), worked out from the habit's days like streaks — never stored. Pure and
/// unit-tested; <c>today</c> is the user's local date.
/// </summary>
public static class HabitChallenges
{
    public static readonly IReadOnlySet<int> Lengths = new HashSet<int> { 7, 30, 90 };

    /// <summary>
    /// A build habit's challenge is every scheduled day from <paramref name="start"/> to its end done (a day not done
    /// yet today doesn't break it — the day isn't over); it's completed on its last scheduled day. An avoid habit's is
    /// no slip on any day of it; completed once its last day is reached clean (today counts while clean).
    /// <paramref name="logged"/> is the build habit's done days (met) or the avoid habit's slips.
    /// </summary>
    public static ChallengeProgress Evaluate(int days, DateOnly start, bool avoid, byte scheduleDays, DateOnly habitStart,
        IReadOnlySet<DateOnly> logged, DateOnly today)
    {
        var end = start.AddDays(days - 1);
        var from = start < habitStart ? habitStart : start;

        if (avoid)
        {
            var slip = logged.Where(d => d >= from && d <= end && d <= today).Order().FirstOrDefault();
            if (slip != default)
            {
                return new ChallengeProgress(ChallengeStates.Broken, slip.DayNumber - from.DayNumber, days, end, null);
            }

            var clean = Math.Clamp(today.DayNumber - from.DayNumber + 1, 0, days);
            return today >= end
                ? new ChallengeProgress(ChallengeStates.Completed, days, days, end, end)
                : new ChallengeProgress(ChallengeStates.Active, clean, days, end, null);
        }

        var due = new List<DateOnly>();
        for (var day = from; day <= end; day = day.AddDays(1))
        {
            if (HabitStreaks.IsScheduled(scheduleDays, day))
            {
                due.Add(day);
            }
        }

        var done = due.Count(d => d <= today && logged.Contains(d));
        if (due.Any(d => d < today && !logged.Contains(d)))
        {
            return new ChallengeProgress(ChallengeStates.Broken, done, due.Count, end, null);
        }

        return due.Count > 0 && due.All(logged.Contains)
            ? new ChallengeProgress(ChallengeStates.Completed, done, due.Count, end, due[^1])
            : new ChallengeProgress(ChallengeStates.Active, done, due.Count, end, null);
    }
}
