using System.Globalization;

namespace LifeOS.Core.Story.Services;

/// <summary>A chapter's span: inclusive calendar days; End null = the open (current) chapter, running on.</summary>
public record ChapterSpan(int Id, string Title, DateOnly Start, DateOnly? End);

/// <summary>
/// The outcome of checking a new or edited chapter: an error, or OK — possibly with the current chapter to close
/// (<see cref="CloseChapterId"/> on <see cref="CloseOn"/>) because the candidate starts the next one.
/// </summary>
public record ChapterCheck(string? Error, int? CloseChapterId = null, DateOnly? CloseOn = null)
{
    public bool Ok => Error is null;
}

/// <summary>
/// Chapters run one after another like a book (confirmed 2026-10-15): no two overlap, and at most one is open. Pure
/// and unit-tested; the service loads the user's other live chapters and applies the result. UX_Chapters_User_Open and
/// UX_Chapters_User_Start back the "one open" and "distinct starts" parts up in the database.
/// </summary>
public static class ChapterRules
{
    /// <param name="others">The user's other live chapters (excluding the one being edited).</param>
    /// <param name="candidate">The chapter as it would be saved (Id 0 for a new one).</param>
    public static ChapterCheck Check(IReadOnlyCollection<ChapterSpan> others, ChapterSpan candidate)
    {
        if (candidate.End is { } end && end < candidate.Start)
        {
            return new ChapterCheck("A chapter can't end before it starts.");
        }

        var spans = others.ToList();
        int? closeId = null;
        DateOnly? closeOn = null;

        // Starting a new current chapter turns the page: the chapter you're in now ends the day before. Only
        // forwards — a new "current" chapter can't start before the one you're already living.
        if (candidate.End is null && spans.FirstOrDefault(s => s.End is null) is { } open)
        {
            if (candidate.Start <= open.Start)
            {
                return new ChapterCheck(
                    $"You're in \"{open.Title}\" since {Day(open.Start)}; a new current chapter has to start after that.");
            }

            closeId = open.Id;
            closeOn = candidate.Start.AddDays(-1);
            spans = spans.Select(s => s.Id == open.Id ? s with { End = closeOn } : s).ToList();
        }

        var clash = spans.FirstOrDefault(s => Overlaps(s, candidate));
        if (clash is not null)
        {
            var range = clash.End is { } clashEnd ? $"{Day(clash.Start)} – {Day(clashEnd)}" : $"since {Day(clash.Start)}";
            return new ChapterCheck($"That overlaps \"{clash.Title}\" ({range}). Chapters follow one another.");
        }

        return new ChapterCheck(null, closeId, closeOn);
    }

    /// <summary>Inclusive day ranges; an open chapter runs on indefinitely.</summary>
    public static bool Overlaps(ChapterSpan a, ChapterSpan b) =>
        a.Start <= (b.End ?? DateOnly.MaxValue) && b.Start <= (a.End ?? DateOnly.MaxValue);

    /// <summary>The chapter a day falls in, if any (chapters don't overlap, so at most one).</summary>
    public static ChapterSpan? On(IEnumerable<ChapterSpan> chapters, DateOnly day) =>
        chapters.FirstOrDefault(c => c.Start <= day && day <= (c.End ?? DateOnly.MaxValue));

    // The app's one date format (14/Oct/2026), pinned to the invariant culture so the month name doesn't follow the
    // server's locale.
    private static string Day(DateOnly day) => day.ToString("dd/MMM/yyyy", CultureInfo.InvariantCulture);

    /// <summary>The first day of the month <paramref name="day"/> is in — the key of a monthly life-area rating.</summary>
    public static DateOnly MonthStart(DateOnly day) => new(day.Year, day.Month, 1);
}
