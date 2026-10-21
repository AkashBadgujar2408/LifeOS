using LifeOS.Core.Leisure.DTOs;

namespace LifeOS.Core.Leisure.Services;

/// <summary>A media item as the year in media reads it.</summary>
public record MediaFact(int Id, string Kind, string Title, string? Creator, string Status, DateOnly? FinishedOn, byte? Rating,
    IReadOnlyList<string> Tags);

/// <summary>A logged watch / play / listen, with its item's kind.</summary>
public record MediaLogFact(int MediaItemId, string Kind, DateOnly LoggedOn, int? Minutes);

/// <summary>A hobby practice session.</summary>
public record HobbySessionFact(int HobbyId, DateOnly PracticedOn, int Minutes);

/// <summary>
/// Leisure's figures (Session 78b), computed on every read and never stored: the year in media (what was finished,
/// time logged, the best-rated, the genres) and the time given to each hobby month by month.
/// </summary>
public static class LeisureFigures
{
    public const int TopRatedCount = 5;
    public const int GenreCount = 8;
    /// <summary>A finished item rated this or higher is a highlight (top-rated here, a Life Story beat).</summary>
    public const byte HighlightRating = 4;

    public static YearInMediaDto YearInMedia(int year, IReadOnlyCollection<MediaFact> items, IReadOnlyCollection<MediaLogFact> logs)
    {
        var finished = items
            .Where(i => i.Status == MediaStatuses.Finished && i.FinishedOn?.Year == year)
            .ToList();
        var yearLogs = logs.Where(l => l.LoggedOn.Year == year).ToList();

        // Every kind, in the fixed order, so the page reads the same each year (zeros included).
        var byKind = MediaKinds.All
            .Select(kind => new MediaKindYearDto
            {
                Kind = kind,
                Finished = finished.Count(i => i.Kind == kind),
                Logged = yearLogs.Count(l => l.Kind == kind),
                Minutes = yearLogs.Where(l => l.Kind == kind).Sum(l => l.Minutes ?? 0),
            })
            .ToList();

        var topRated = finished
            .Where(i => i.Rating >= HighlightRating)
            .OrderByDescending(i => i.Rating)
            .ThenByDescending(i => i.FinishedOn)
            .ThenBy(i => i.Title, StringComparer.CurrentCultureIgnoreCase)
            .Take(TopRatedCount)
            .Select(i => new MediaHighlightDto
            {
                Id = i.Id, Kind = i.Kind, Title = i.Title, Creator = i.Creator, Rating = i.Rating!.Value, FinishedOn = i.FinishedOn!.Value,
            })
            .ToList();

        // Genres = the tags of what was finished; ties by name so the order is stable.
        var genres = finished
            .SelectMany(i => i.Tags.Distinct(StringComparer.OrdinalIgnoreCase))
            .GroupBy(t => t, StringComparer.OrdinalIgnoreCase)
            .Select(g => new GenreCountDto { Name = g.First(), Count = g.Count() })
            .OrderByDescending(g => g.Count)
            .ThenBy(g => g.Name, StringComparer.CurrentCultureIgnoreCase)
            .Take(GenreCount)
            .ToList();

        var years = items.Where(i => i.FinishedOn is not null).Select(i => i.FinishedOn!.Value.Year)
            .Concat(logs.Select(l => l.LoggedOn.Year))
            .Append(year)
            .Distinct()
            .OrderDescending()
            .ToList();

        return new YearInMediaDto
        {
            Year = year,
            Finished = finished.Count,
            Minutes = byKind.Sum(k => k.Minutes),
            ByKind = byKind,
            TopRated = topRated,
            Genres = genres,
            Years = years,
        };
    }

    /// <summary>
    /// Minutes per hobby for each month from <paramref name="firstMonth"/> to <paramref name="lastMonth"/> (both the
    /// 1st of their month), oldest first — empty months kept, so a quiet month shows as one.
    /// </summary>
    public static List<HobbyMonthDto> ByMonth(IReadOnlyCollection<HobbySessionFact> sessions, DateOnly firstMonth, DateOnly lastMonth)
    {
        var months = new List<HobbyMonthDto>();
        for (var month = firstMonth; month <= lastMonth; month = month.AddMonths(1))
        {
            var next = month.AddMonths(1);
            months.Add(new HobbyMonthDto
            {
                Month = month,
                Hobbies = sessions
                    .Where(s => s.PracticedOn >= month && s.PracticedOn < next)
                    .GroupBy(s => s.HobbyId)
                    .Select(g => new HobbyMinutesDto { HobbyId = g.Key, Minutes = g.Sum(s => s.Minutes) })
                    .OrderBy(h => h.HobbyId)
                    .ToList(),
            });
        }

        return months;
    }

    /// <summary>The 1st of the month a day falls in.</summary>
    public static DateOnly MonthStart(DateOnly day) => new(day.Year, day.Month, 1);
}
