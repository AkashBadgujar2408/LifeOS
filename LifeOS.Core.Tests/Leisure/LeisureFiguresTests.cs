using LifeOS.Core.Leisure.DTOs;
using LifeOS.Core.Leisure.Services;

namespace LifeOS.Core.Tests.Leisure;

public class LeisureFiguresTests
{
    private static DateOnly D(int year, int month, int day) => new(year, month, day);

    private static MediaFact Fact(int id, string kind, string status, DateOnly? finishedOn = null, byte? rating = null,
        params string[] tags) => new(id, kind, $"Item {id}", null, status, finishedOn, rating, tags);

    [Fact]
    public void The_year_counts_only_what_was_finished_that_year_and_keeps_every_kind()
    {
        var items = new[]
        {
            Fact(1, MediaKinds.Book, MediaStatuses.Finished, D(2026, 3, 1)),
            Fact(2, MediaKinds.Book, MediaStatuses.Finished, D(2025, 12, 31)),
            Fact(3, MediaKinds.Film, MediaStatuses.Finished, D(2026, 10, 1)),
            Fact(4, MediaKinds.Film, MediaStatuses.InProgress),
            Fact(5, MediaKinds.Game, MediaStatuses.Dropped),
        };

        var year = LeisureFigures.YearInMedia(2026, items, []);

        Assert.Equal(2, year.Finished);
        Assert.Equal(MediaKinds.All, year.ByKind.Select(k => k.Kind));
        Assert.Equal(1, year.ByKind.Single(k => k.Kind == MediaKinds.Book).Finished);
        Assert.Equal(0, year.ByKind.Single(k => k.Kind == MediaKinds.Game).Finished);
        Assert.Equal([2026, 2025], year.Years);
    }

    [Fact]
    public void Time_is_the_years_logs_and_a_log_without_a_length_adds_no_minutes()
    {
        var logs = new[]
        {
            new MediaLogFact(3, MediaKinds.Film, D(2026, 10, 1), 120),
            new MediaLogFact(3, MediaKinds.Film, D(2026, 10, 5), null),
            new MediaLogFact(3, MediaKinds.Film, D(2025, 6, 1), 90),
            new MediaLogFact(6, MediaKinds.Album, D(2026, 2, 2), 45),
        };

        var year = LeisureFigures.YearInMedia(2026, [], logs);

        var film = year.ByKind.Single(k => k.Kind == MediaKinds.Film);
        Assert.Equal((2, 120), (film.Logged, film.Minutes));
        Assert.Equal(165, year.Minutes);
    }

    [Fact]
    public void Top_rated_is_four_or_five_stars_best_first_then_most_recent()
    {
        var items = new[]
        {
            Fact(1, MediaKinds.Book, MediaStatuses.Finished, D(2026, 1, 5), 4),
            Fact(2, MediaKinds.Film, MediaStatuses.Finished, D(2026, 2, 5), 5),
            Fact(3, MediaKinds.Film, MediaStatuses.Finished, D(2026, 9, 5), 4),
            Fact(4, MediaKinds.Film, MediaStatuses.Finished, D(2026, 9, 6), 3),
            Fact(5, MediaKinds.Game, MediaStatuses.Dropped, null, 5),
        };

        var year = LeisureFigures.YearInMedia(2026, items, []);

        Assert.Equal([2, 3, 1], year.TopRated.Select(t => t.Id));
    }

    [Fact]
    public void Genres_are_the_tags_of_what_was_finished_most_first()
    {
        var items = new[]
        {
            Fact(1, MediaKinds.Book, MediaStatuses.Finished, D(2026, 1, 5), null, "Sci-fi", "Classic"),
            Fact(2, MediaKinds.Film, MediaStatuses.Finished, D(2026, 2, 5), null, "sci-fi"),
            Fact(3, MediaKinds.Film, MediaStatuses.Want, null, null, "Horror"),
        };

        var year = LeisureFigures.YearInMedia(2026, items, []);

        Assert.Equal([("Sci-fi", 2), ("Classic", 1)], year.Genres.Select(g => (g.Name, g.Count)));
    }

    [Fact]
    public void Hobby_months_run_oldest_first_and_keep_empty_months()
    {
        var sessions = new[]
        {
            new HobbySessionFact(1, D(2026, 8, 3), 30),
            new HobbySessionFact(1, D(2026, 8, 31), 15),
            new HobbySessionFact(2, D(2026, 10, 1), 60),
            new HobbySessionFact(1, D(2026, 7, 31), 99),
        };

        var months = LeisureFigures.ByMonth(sessions, D(2026, 8, 1), D(2026, 10, 1));

        Assert.Equal([D(2026, 8, 1), D(2026, 9, 1), D(2026, 10, 1)], months.Select(m => m.Month));
        Assert.Equal(45, months[0].Hobbies.Single().Minutes);
        Assert.Empty(months[1].Hobbies);
        Assert.Equal((2, 60), (months[2].Hobbies.Single().HobbyId, months[2].Hobbies.Single().Minutes));
    }
}
