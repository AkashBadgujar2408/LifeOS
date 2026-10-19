using System.Globalization;
using LifeOS.Core.Habits.Services;
using LifeOS.Core.Health.DTOs;

namespace LifeOS.Core.Health.Services;

/// <summary>A medicine's schedule as the rules need it.</summary>
public sealed record MedicationPlan(DateOnly StartDate, DateOnly? EndDate, bool IsAsNeeded);

/// <summary>One schedule of a medicine: the weekdays it applies to.</summary>
public sealed record DoseSlot(int ScheduleId, byte ScheduleDays);

/// <summary>
/// When doses are due and how well they were kept. A scheduled dose is due on every day the medicine is current
/// (StartDate..EndDate) whose weekday is in the schedule — the same weekday bitmask as habits
/// (<see cref="HabitStreaks.IsScheduled"/>). As-needed medicines are never due.
/// </summary>
public static class MedicationRules
{
    public const int MostSchedules = 12;
    public const int AdherenceDays = 30;

    public static bool IsCurrent(MedicationPlan plan, DateOnly day) =>
        plan.StartDate <= day && (plan.EndDate is null || day <= plan.EndDate);

    public static bool IsDue(MedicationPlan plan, byte scheduleDays, DateOnly day) =>
        !plan.IsAsNeeded && IsCurrent(plan, day) && HabitStreaks.IsScheduled(scheduleDays, day);

    /// <summary>"08:00" / "8:05" → a time of day on the minute, or null when it isn't one.</summary>
    public static TimeOnly? ParseTime(string? value) =>
        TimeOnly.TryParseExact(value?.Trim(), ["HH:mm", "H:mm"], CultureInfo.InvariantCulture, DateTimeStyles.None, out var time)
            ? time
            : null;

    public static string FormatTime(TimeOnly time) => time.ToString("HH:mm", CultureInfo.InvariantCulture);

    public static string? CheckMedication(MedicationRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return "Name the medicine.";
        }

        if (request.EndDate is { } end && end < request.StartDate)
        {
            return "It can't stop before it starts.";
        }

        if (request.IsAsNeeded)
        {
            return request.Schedules.Count > 0 ? "A medicine taken as needed has no schedule." : null;
        }

        if (request.Schedules.Count == 0)
        {
            return "Add the times it's taken, or mark it as taken when needed.";
        }

        if (request.Schedules.Count > MostSchedules)
        {
            return $"No more than {MostSchedules} times a day.";
        }

        var times = new HashSet<TimeOnly>();
        foreach (var schedule in request.Schedules)
        {
            if (ParseTime(schedule.TimeOfDay) is not { } time)
            {
                return "Give each time as hours and minutes, like 08:00.";
            }

            if (!times.Add(time))
            {
                return $"{FormatTime(time)} is in the schedule twice.";
            }

            if (schedule.ScheduleDays is < 1 or > 127)
            {
                return "Pick at least one day for each time.";
            }
        }

        return null;
    }

    /// <summary>Why a dose can't be marked on <paramref name="day"/>, or null. Clearing one is always allowed.</summary>
    public static string? CheckDose(MedicationPlan plan, byte scheduleDays, DateOnly day, DateOnly today)
    {
        if (day > today)
        {
            return "A dose can't be marked ahead of its day.";
        }

        if (!IsCurrent(plan, day))
        {
            return "The medicine wasn't being taken that day.";
        }

        return HabitStreaks.IsScheduled(scheduleDays, day) ? null : "That time isn't scheduled that day.";
    }

    public static string? CheckAsNeeded(MedicationPlan plan, DateOnly day, DateOnly today)
    {
        if (!plan.IsAsNeeded)
        {
            return "This medicine has a schedule — tick its doses instead.";
        }

        if (day > today)
        {
            return "A dose can't be logged ahead of its day.";
        }

        return IsCurrent(plan, day) ? null : "The medicine wasn't being taken that day.";
    }

    /// <summary>
    /// Doses taken of those due in the <see cref="AdherenceDays"/> days up to today, as a whole %. Today counts only
    /// for doses already marked (one still to come isn't missed yet); skipped counts as not taken. Null when
    /// nothing was due.
    /// </summary>
    public static int? Adherence(
        MedicationPlan plan, IReadOnlyCollection<DoseSlot> slots, IReadOnlyDictionary<(int ScheduleId, DateOnly Day), string> marked,
        DateOnly today)
    {
        var due = 0;
        var taken = 0;
        for (var day = today.AddDays(-(AdherenceDays - 1)); day <= today; day = day.AddDays(1))
        {
            foreach (var slot in slots)
            {
                if (!IsDue(plan, slot.ScheduleDays, day))
                {
                    continue;
                }

                marked.TryGetValue((slot.ScheduleId, day), out var status);
                if (day == today && status is null)
                {
                    continue;
                }

                due++;
                if (status == "Taken")
                {
                    taken++;
                }
            }
        }

        return due == 0 ? null : (int)Math.Floor(100.0 * taken / due);
    }
}
