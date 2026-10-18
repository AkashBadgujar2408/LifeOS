using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Tasks.DTOs;
using LifeOS.Core.Tasks.Services;

namespace LifeOS.Core.Finance.Services;

/// <summary>
/// When a repeating transaction writes into the ledger. Occurrences are counted from the start date the same way
/// tasks and events count theirs (<see cref="TaskRecurrence.Occurrence"/>, so the 31st becomes the 28th/30th in
/// short months and comes back). Pure and unit-tested.
/// </summary>
public static class RecurringSchedule
{
    /// <summary>Most occurrences written in one go — a daily schedule started years ago still catches up in a few calls.</summary>
    public const int MaxPerRun = 400;

    public static bool IsKnownFrequency(string frequency) =>
        frequency is RecurrenceFrequencies.Daily or RecurrenceFrequencies.Weekly
            or RecurrenceFrequencies.Monthly or RecurrenceFrequencies.Yearly;

    /// <summary>
    /// The days due to be written now: every occurrence after <paramref name="generatedThrough"/> (from the start
    /// when nothing has been written) up to today and not past <paramref name="until"/>, at most <see cref="MaxPerRun"/>.
    /// </summary>
    public static List<DateOnly> Due(
        string frequency, int interval, DateOnly start, DateOnly? until, DateOnly? generatedThrough, DateOnly today)
    {
        var due = new List<DateOnly>();
        var last = until is { } u && u < today ? u : today;
        for (var k = 0; due.Count < MaxPerRun; k++)
        {
            var day = TaskRecurrence.Occurrence(frequency, interval, start, k);
            if (day > last)
            {
                break;
            }

            if (generatedThrough is null || day > generatedThrough)
            {
                due.Add(day);
            }
        }

        return due;
    }

    /// <summary>The next day it will write (after what's already written), or null once it's run out.</summary>
    public static DateOnly? Next(string frequency, int interval, DateOnly start, DateOnly? until, DateOnly? generatedThrough)
    {
        for (var k = 0; k < 100_000; k++)
        {
            var day = TaskRecurrence.Occurrence(frequency, interval, start, k);
            if (until is { } u && day > u)
            {
                return null;
            }

            if (generatedThrough is null || day > generatedThrough)
            {
                return day;
            }
        }

        return null;
    }

    /// <summary>
    /// How far a schedule counts as written after a run: today, or its last day if that came first. A run that hit
    /// <see cref="MaxPerRun"/> stops at the last day it wrote, so the next run carries on from there.
    /// </summary>
    public static DateOnly WrittenThrough(IReadOnlyList<DateOnly> due, DateOnly? until, DateOnly today) =>
        due.Count >= MaxPerRun ? due[^1]
        : until is { } u && u < today ? u
        : today;

    /// <summary>
    /// Un-pausing carries on from today rather than writing everything missed while paused: what's written is moved
    /// up to yesterday (an occurrence due today is still written).
    /// </summary>
    public static DateOnly? OnResume(DateOnly? generatedThrough, DateOnly today)
    {
        var yesterday = today.AddDays(-1);
        return generatedThrough is { } g && g >= yesterday ? g : yesterday;
    }
}

/// <summary>Budget lines: remaining, % used and over, worked out from the month's figures. Pure and unit-tested.</summary>
public static class BudgetSummary
{
    public sealed record Line(int TagId, string TagName, decimal? Budget, string? BudgetCurrency, decimal Spent, int TransactionCount, int Unconverted);

    /// <summary>
    /// A budget compares with spending only in the base currency it was set in (one set before the base currency
    /// changed is shown, not judged). Budgeted tags come first, fullest first; then unbudgeted ones, biggest first.
    /// </summary>
    public static List<BudgetLineDto> Summarise(IEnumerable<Line> lines, string? baseCurrency) =>
        lines.Select(l =>
            {
                var comparable = l.Budget is > 0 && l.BudgetCurrency == baseCurrency;
                return new BudgetLineDto
                {
                    TagId = l.TagId,
                    TagName = l.TagName,
                    Budget = l.Budget,
                    BudgetCurrency = l.BudgetCurrency,
                    Spent = Math.Round(l.Spent, 4),
                    TransactionCount = l.TransactionCount,
                    Unconverted = l.Unconverted,
                    Remaining = comparable ? Math.Round(l.Budget!.Value - l.Spent, 4) : null,
                    PercentUsed = comparable ? (int)Math.Floor(l.Spent * 100 / l.Budget!.Value) : null,
                    IsOver = comparable && l.Spent > l.Budget!.Value,
                };
            })
            .OrderBy(l => l.Budget is null)
            .ThenByDescending(l => l.Budget is null ? l.Spent : l.PercentUsed ?? -1)
            .ThenBy(l => l.TagName, StringComparer.OrdinalIgnoreCase)
            .ToList();

    /// <summary>The first day of the month before.</summary>
    public static DateOnly PreviousMonth(DateOnly monthStart) => monthStart.AddMonths(-1);

    public static DateOnly MonthStart(DateOnly day) => new(day.Year, day.Month, 1);
}
