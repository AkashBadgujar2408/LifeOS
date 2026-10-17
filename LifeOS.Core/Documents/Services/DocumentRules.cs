using System.Globalization;
using LifeOS.Core.Calendar.Services;

namespace LifeOS.Core.Documents.Services;

/// <summary>Pure document helpers (xUnit-tested).</summary>
public static class DocumentRules
{
    /// <summary>When an expiry reminder fires: 09:00 local time, this many days before the document expires.</summary>
    public static readonly TimeOnly ReminderTime = new(9, 0);

    /// <summary>
    /// The last 4 letters/digits of a typed number ("P 123 456-789" → "6789"), upper-cased; null when there are none.
    /// The rest is thrown away — LifeOS never keeps a whole passport or account number.
    /// </summary>
    public static string? Last4(string? typed)
    {
        if (string.IsNullOrWhiteSpace(typed))
        {
            return null;
        }

        var kept = typed.Where(char.IsLetterOrDigit).ToArray();
        return kept.Length == 0 ? null : new string(kept[^Math.Min(4, kept.Length)..]).ToUpperInvariant();
    }

    /// <summary>The expiry reminder's moment (UTC): 09:00 in <paramref name="zone"/> on the day N days before expiry.</summary>
    public static DateTime ExpiryReminderAt(DateOnly expiresOn, int daysBefore, TimeZoneInfo zone) =>
        EventRecurrence.LocalToUtc(expiresOn.AddDays(-daysBefore).ToDateTime(ReminderTime), zone);

    /// <summary>"Passport expires on 14/Oct/2027" (the app's one date format; invariant so the server locale can't change it).</summary>
    public static string ExpiryReminderTitle(string documentTitle, DateOnly expiresOn)
    {
        var suffix = $" expires on {expiresOn.ToString("dd'/'MMM'/'yyyy", CultureInfo.InvariantCulture)}";
        // Reminder titles are at most 200 characters.
        var title = documentTitle.Length + suffix.Length > 200 ? documentTitle[..(200 - suffix.Length - 1)] + "…" : documentTitle;
        return title + suffix;
    }
}
