using System.Globalization;
using LifeOS.Core.Documents.Services;

namespace LifeOS.Core.Journal.Services;

/// <summary>Pure rules for the decision journal's review reminder (unit-tested).</summary>
public static class DecisionRules
{
    /// <summary>09:00 on the review day in the user's zone, as UTC — the same morning time as document expiry reminders.</summary>
    public static DateTime ReviewReminderAt(DateOnly reviewOn, TimeZoneInfo zone) =>
        DocumentRules.ExpiryReminderAt(reviewOn, 0, zone);

    /// <summary>"Review your decision: Take the Berlin job" (cut to fit a reminder title).</summary>
    public static string ReviewReminderTitle(string decisionTitle)
    {
        const string prefix = "Review your decision: ";
        var room = 200 - prefix.Length;
        var title = decisionTitle.Length <= room ? decisionTitle : decisionTitle[..(room - 1)].TrimEnd() + "…";
        return prefix + title;
    }

    /// <summary>"Decided on 14/Oct/2026. You expected: …" — the reminder's note, so it reads well on its own.</summary>
    public static string ReviewReminderNotes(DateOnly decidedOn, string? expectedOutcome)
    {
        var decided = $"Decided on {decidedOn.ToString("dd'/'MMM'/'yyyy", CultureInfo.InvariantCulture)}.";
        return string.IsNullOrWhiteSpace(expectedOutcome)
            ? $"{decided} How did it turn out?"
            : $"{decided} You expected: {Cut(expectedOutcome.Trim(), 400)}";
    }

    private static string Cut(string text, int length) =>
        text.Length <= length ? text : text[..(length - 1)].TrimEnd() + "…";
}
