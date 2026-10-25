using System.Text.RegularExpressions;
using LifeOS.Core.Career.DTOs;

namespace LifeOS.Core.Career.Services;

/// <summary>
/// Career's rules, mirroring the CHECKs in 11_career.sql so a refusal reads as a sentence rather than a SQL error.
/// Pure and unit-tested.
/// </summary>
public static partial class CareerRules
{
    [GeneratedRegex("^[A-Z]{3}$")]
    private static partial Regex CurrencyCode();

    /// <summary>"inr " → "INR"; null when it isn't three letters.</summary>
    public static string? Currency(string? code)
    {
        var cleaned = code?.Trim().ToUpperInvariant() ?? string.Empty;
        return CurrencyCode().IsMatch(cleaned) ? cleaned : null;
    }

    public static string? CheckRole(string employmentType, DateOnly start, DateOnly? end) =>
        !EmploymentTypes.All.Contains(employmentType) ? "Unknown kind of employment."
        : end is { } e && e < start ? "A role can't end before it starts."
        : null;

    /// <summary>
    /// A promotion is from the current role (no end date) to a new one starting <paramref name="on"/>, which must be
    /// after the current role started — the old role then ends the day before.
    /// </summary>
    public static string? CheckPromotion(DateOnly currentStart, DateOnly? currentEnd, DateOnly on) =>
        currentEnd is not null ? "Only a current role can lead to a promotion — this one has ended."
        : on <= currentStart ? "The promotion has to come after the role started."
        : null;

    /// <summary>A link someone can open: an absolute http(s) address (blank is fine — there's none).</summary>
    public static bool IsWebAddress(string? url) =>
        string.IsNullOrWhiteSpace(url)
        || (Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps));

    /// <summary>
    /// A side income source: a known kind and status, started no later than today, an end day only once it has
    /// Ended (CK_SideIncomeSources_Ended) and not before it started, nor after today.
    /// </summary>
    public static string? CheckSideIncome(string kind, string status, DateOnly? startedOn, DateOnly? endedOn, DateOnly today) =>
        !SideIncomeKinds.All.Contains(kind) ? "Unknown kind of side income."
        : !SideIncomeStatuses.All.Contains(status) ? "Unknown status."
        : startedOn is { } s && s > today ? "It can't start in the future."
        : endedOn is not null && status != SideIncomeStatuses.Ended ? "Only an ended source has an end day."
        : endedOn is { } e && e > today ? "It can't end in the future."
        : startedOn is { } start && endedOn is { } end && end < start ? "It can't end before it started."
        : null;

    /// <summary>Something dated in a role (a pay record, a review) falls within that role's dates.</summary>
    public static string? CheckDayInRole(DateOnly effectiveOn, DateOnly? roleStart, DateOnly? roleEnd) =>
        roleStart is { } start && effectiveOn < start ? "That's before the role started."
        : roleEnd is { } end && effectiveOn > end ? "That's after the role ended."
        : null;

    /// <summary>
    /// A mock interview: held on a day no later than today, by a named AI, lasting 1–600 minutes when given
    /// (CK_MockInterviews_Tool / _Duration).
    /// </summary>
    public static string? CheckMockInterview(DateOnly heldOn, string tool, int? durationMinutes, DateOnly today) =>
        heldOn == default ? "Pick the day it was held."
        : today == default ? "Today's date is required."
        : heldOn > today ? "A mock interview can't be in the future."
        : string.IsNullOrWhiteSpace(tool) ? "Say which AI ran it."
        : durationMinutes is < 1 or > 600 ? "The length has to be between 1 and 600 minutes."
        : null;
}

/// <summary>Salary history: change % per move, between records that can be compared (same currency and period).</summary>
public static class SalaryHistory
{
    /// <summary>
    /// Fills <see cref="SalaryRecordDto.ChangePercent"/> on each record: the change from the latest earlier record in
    /// the same currency and period, as a percentage rounded to one decimal (null when there's nothing to compare
    /// with). Records on the same day are taken in id order.
    /// </summary>
    public static void FillChanges(IReadOnlyCollection<SalaryRecordDto> records)
    {
        foreach (var series in records.GroupBy(r => (r.Currency, r.Period)))
        {
            SalaryRecordDto? previous = null;
            foreach (var record in series.OrderBy(r => r.EffectiveOn).ThenBy(r => r.Id))
            {
                record.ChangePercent = previous is null
                    ? null
                    : Math.Round((record.Amount - previous.Amount) * 100m / previous.Amount, 1, MidpointRounding.AwayFromZero);
                previous = record;
            }
        }
    }
}
