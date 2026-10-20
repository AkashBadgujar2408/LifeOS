using LifeOS.Core.Finance.Services;
using LifeOS.Core.Purchases.DTOs;
using LifeOS.Core.Tasks.DTOs;
using LifeOS.Core.Tasks.Services;

namespace LifeOS.Core.Purchases.Services;

/// <summary>Matches CK_Subscriptions_Status.</summary>
public static class SubscriptionStatuses
{
    public const string Active = "Active";
    public const string Paused = "Paused";
    public const string Cancelled = "Cancelled";

    public static readonly IReadOnlySet<string> All = new HashSet<string>([Active, Paused, Cancelled], StringComparer.Ordinal);
}

/// <summary>Where a return stands (computed).</summary>
public static class ReturnStates
{
    /// <summary>Not sent back yet, still in time (or no deadline).</summary>
    public const string Open = "Open";
    /// <summary>The return-by day passed without sending it back.</summary>
    public const string Missed = "Missed";
    /// <summary>Sent back, refund not in yet.</summary>
    public const string AwaitingRefund = "AwaitingRefund";
    public const string Refunded = "Refunded";
}

/// <summary>
/// Subscriptions and returns, mirroring CK_Subscriptions_* / CK_Returns_* and computing what's never stored: the next
/// charge (counted from the first, like every repeat — month ends clamp), what a subscription costs per month and per
/// year, the charges inside a range (for the calendar), whether a decide-by day is close, and where a return stands.
/// Pure and unit-tested.
/// </summary>
public static class SubscriptionRules
{
    /// <summary>"Decide by" and "return by" days show as needing attention this many days ahead (and once past).</summary>
    public const int AttentionDays = 7;

    private static readonly HashSet<string> Frequencies =
        [RecurrenceFrequencies.Weekly, RecurrenceFrequencies.Monthly, RecurrenceFrequencies.Yearly];

    public static string? Check(
        string name, decimal amount, string? currency, string frequency, int interval, DateOnly startedOn, string status,
        DateOnly? cancelledOn, DateOnly? cancelBy, int? reminderDays, DateOnly today) =>
        name.Trim().Length == 0 ? "Name it (e.g. Netflix)."
        : amount <= 0 || amount > FinanceRules.MaxAmount ? "The amount has to be more than zero."
        : currency is null ? "Choose the currency."
        : !Frequencies.Contains(frequency) ? "Charged every week, month or year."
        : interval is < 1 or > 99 ? "Every 1 to 99."
        : startedOn == default ? "Say when it was (or will be) first charged."
        : !SubscriptionStatuses.All.Contains(status) ? "Unknown status."
        : status == SubscriptionStatuses.Cancelled && cancelledOn is null ? "Say when it was cancelled."
        : status != SubscriptionStatuses.Cancelled && cancelledOn is not null ? "Only a cancelled subscription has a cancel day."
        : cancelledOn is { } c && c < startedOn ? "It can't be cancelled before it started."
        : cancelledOn is { } c2 && c2 > today ? "Cancelling ahead: set it on the day it stops (or use \"decide by\")."
        : cancelBy is { } b && b < startedOn ? "The decide-by day is before it started."
        : reminderDays is < 0 or > 365 ? "Remind 0 to 365 days before."
        : null;

    /// <summary>
    /// The next charge on or after <paramref name="from"/> — none while paused, and none on or after the cancel day.
    /// </summary>
    public static DateOnly? NextCharge(string frequency, int interval, DateOnly startedOn, string status, DateOnly? cancelledOn, DateOnly from)
    {
        if (status == SubscriptionStatuses.Paused)
        {
            return null;
        }

        for (var k = 0; k < 100_000; k++)
        {
            var day = TaskRecurrence.Occurrence(frequency, interval, startedOn, k);
            if (cancelledOn is { } c && day >= c)
            {
                return null;
            }

            if (day >= from)
            {
                return day;
            }
        }

        return null;
    }

    /// <summary>Every charge day in [from, to] (for the calendar); nothing while paused or from the cancel day.</summary>
    public static List<DateOnly> ChargesBetween(
        string frequency, int interval, DateOnly startedOn, string status, DateOnly? cancelledOn, DateOnly from, DateOnly to)
    {
        var days = new List<DateOnly>();
        if (status == SubscriptionStatuses.Paused)
        {
            return days;
        }

        for (var k = 0; k < 100_000; k++)
        {
            var day = TaskRecurrence.Occurrence(frequency, interval, startedOn, k);
            if (day > to || (cancelledOn is { } c && day >= c))
            {
                break;
            }

            if (day >= from)
            {
                days.Add(day);
            }
        }

        return days;
    }

    /// <summary>What it costs per month on average (a yearly ₹1,499 is ₹124.92 a month; weekly counts 52 weeks a year).</summary>
    public static decimal MonthlyCost(decimal amount, string frequency, int interval) =>
        Math.Round(frequency switch
        {
            RecurrenceFrequencies.Weekly => amount * 52m / 12m / interval,
            RecurrenceFrequencies.Yearly => amount / (12m * interval),
            _ => amount / interval,
        }, 2, MidpointRounding.AwayFromZero);

    /// <summary>Monthly and yearly totals per currency over the subscriptions still running (active ones only).</summary>
    public static List<SubscriptionTotalDto> Totals(IEnumerable<(string Currency, decimal Amount, string Frequency, int Interval, string Status)> subscriptions) =>
        subscriptions.Where(s => s.Status == SubscriptionStatuses.Active)
            .GroupBy(s => s.Currency)
            .OrderBy(g => g.Key, StringComparer.Ordinal)
            .Select(g =>
            {
                var monthly = g.Sum(s => MonthlyCost(s.Amount, s.Frequency, s.Interval));
                return new SubscriptionTotalDto { Currency = g.Key, Monthly = monthly, Yearly = monthly * 12 };
            })
            .ToList();

    /// <summary>A day worth flagging: within <see cref="AttentionDays"/> ahead, or already past (and still open).</summary>
    public static bool NeedsAttention(DateOnly? day, DateOnly today) => day is { } d && d <= today.AddDays(AttentionDays);

    public static string? CheckReturn(DateOnly? returnBy, DateOnly? returnedOn, decimal? refundAmount, int? reminderDays, DateOnly purchasedOn, DateOnly today) =>
        returnBy is { } b && b < purchasedOn ? "The return-by day is before it was bought."
        : returnedOn is { } r && r < purchasedOn ? "It can't go back before it was bought."
        : returnedOn is { } r2 && r2 > today ? "It can't be sent back in the future."
        : refundAmount is <= 0 || refundAmount > FinanceRules.MaxAmount ? "The refund has to be more than zero."
        : reminderDays is < 0 or > 365 ? "Remind 0 to 365 days before."
        : reminderDays is not null && returnBy is null ? "Reminders need a return-by day."
        : null;

    public static string ReturnState(DateOnly? returnBy, DateOnly? returnedOn, DateOnly? refundedOn, DateOnly today) =>
        refundedOn is not null ? ReturnStates.Refunded
        : returnedOn is not null ? ReturnStates.AwaitingRefund
        : returnBy is { } b && b < today ? ReturnStates.Missed
        : ReturnStates.Open;
}
