using LifeOS.Core.Leisure.DTOs;
using LifeOS.Core.Leisure.Services;

namespace LifeOS.Core.Tests.Leisure;

public class LeisureRulesTests
{
    private static readonly DateOnly Today = new(2026, 10, 18);

    private static DateOnly D(int month, int day) => new(2026, month, day);

    private static MediaState Item(string kind, string status = MediaStatuses.Want, int? totalPages = null, int currentPage = 0,
        short? season = null, short? episode = null, DateOnly? startedOn = null, DateOnly? finishedOn = null,
        byte? rating = null, string? review = null, bool upNext = false) =>
        new(kind, status, upNext, totalPages, currentPage, season, episode, startedOn, finishedOn, rating, review);

    [Fact]
    public void Finishing_a_book_moves_to_the_last_page_and_dates_it()
    {
        var (state, error) = LeisureRules.Check(
            Item(MediaKinds.Book, MediaStatuses.Finished, 320, 200, startedOn: D(9, 1), rating: 4), Today);

        Assert.Null(error);
        Assert.Equal(Item(MediaKinds.Book, MediaStatuses.Finished, 320, 320, startedOn: D(9, 1), finishedOn: Today, rating: 4), state);
    }

    [Fact]
    public void Starting_dates_it_and_leaving_finished_clears_the_day()
    {
        Assert.Equal(Today, LeisureRules.Check(Item(MediaKinds.Film, MediaStatuses.InProgress), Today).State!.StartedOn);
        Assert.Null(LeisureRules.Check(Item(MediaKinds.Film, MediaStatuses.Want, finishedOn: D(10, 1)), Today).State!.FinishedOn);
        Assert.Null(LeisureRules.Check(Item(MediaKinds.Game, MediaStatuses.Dropped, finishedOn: D(10, 1)), Today).State!.FinishedOn);
    }

    [Fact]
    public void Each_kind_tracks_only_its_own_progress()
    {
        Assert.Equal("Only a book has pages.", LeisureRules.Check(Item(MediaKinds.Film, totalPages: 100), Today).Error);
        Assert.Equal("Only a book has pages.", LeisureRules.Check(Item(MediaKinds.Album, currentPage: 3), Today).Error);
        Assert.Equal("Only a series or a podcast has episodes.", LeisureRules.Check(Item(MediaKinds.Game, episode: 1), Today).Error);
        Assert.Equal("A podcast has episodes but no seasons.",
            LeisureRules.Check(Item(MediaKinds.Podcast, season: 1, episode: 4), Today).Error);
        Assert.Null(LeisureRules.Check(Item(MediaKinds.Podcast, MediaStatuses.InProgress, episode: 40), Today).Error);
        Assert.Null(LeisureRules.Check(Item(MediaKinds.Series, MediaStatuses.InProgress, season: 2, episode: 3), Today).Error);
    }

    [Fact]
    public void Rules_refuse_what_cant_be_true()
    {
        Assert.NotNull(LeisureRules.Check(Item(MediaKinds.Book, MediaStatuses.InProgress, 100, 101), Today).Error);
        Assert.NotNull(LeisureRules.Check(Item(MediaKinds.Book, MediaStatuses.InProgress, 100, 10, rating: 5), Today).Error);
        Assert.NotNull(LeisureRules.Check(Item(MediaKinds.Film, MediaStatuses.Want, review: "Loved it"), Today).Error);
        Assert.NotNull(LeisureRules.Check(
            Item(MediaKinds.Film, MediaStatuses.Finished, startedOn: D(10, 10), finishedOn: D(10, 1)), Today).Error);
        Assert.NotNull(LeisureRules.Check(Item(MediaKinds.Film, MediaStatuses.Finished, finishedOn: Today.AddDays(1)), Today).Error);
        // Dropping something can still carry a verdict.
        Assert.Null(LeisureRules.Check(Item(MediaKinds.Game, MediaStatuses.Dropped, rating: 2, review: "Too grindy"), Today).Error);
    }

    [Fact]
    public void A_blank_review_is_no_review_and_up_next_only_while_wanted()
    {
        Assert.Null(LeisureRules.Check(Item(MediaKinds.Film, MediaStatuses.Finished, review: "   "), Today).State!.Review);
        Assert.Equal("Great", LeisureRules.Check(Item(MediaKinds.Film, MediaStatuses.Finished, review: " Great "), Today).State!.Review);
        Assert.True(LeisureRules.Check(Item(MediaKinds.Film, upNext: true), Today).State!.UpNext);
        Assert.False(LeisureRules.Check(Item(MediaKinds.Film, MediaStatuses.InProgress, upNext: true), Today).State!.UpNext);
    }

    [Fact]
    public void Moving_the_bookmark_starts_and_finishes_a_book()
    {
        var unread = Item(MediaKinds.Book, totalPages: 300);

        var started = LeisureRules.AtPage(unread, 25, Today).State!;
        Assert.Equal((MediaStatuses.InProgress, 25, (DateOnly?)Today), (started.Status, started.CurrentPage, started.StartedOn));

        var finished = LeisureRules.AtPage(started, 300, Today.AddDays(9)).State!;
        Assert.Equal((MediaStatuses.Finished, (DateOnly?)Today.AddDays(9)), (finished.Status, finished.FinishedOn));

        Assert.NotNull(LeisureRules.AtPage(started, 301, Today).Error);
        Assert.Equal("Only a book has pages.", LeisureRules.AtPage(Item(MediaKinds.Film), 10, Today).Error);
    }

    [Fact]
    public void Going_back_in_a_finished_book_reopens_it_and_sets_the_verdict_aside()
    {
        var finished = Item(MediaKinds.Book, MediaStatuses.Finished, 300, 300, startedOn: D(9, 1), finishedOn: D(10, 1),
            rating: 5, review: "A favourite");

        var reopened = LeisureRules.AtPage(finished, 120, Today).State!;

        Assert.Equal(Item(MediaKinds.Book, MediaStatuses.InProgress, 300, 120, startedOn: D(9, 1)), reopened);
    }

    [Fact]
    public void An_episode_starts_a_show_and_rewatching_reopens_it_but_never_finishes_it()
    {
        var wanted = Item(MediaKinds.Series);
        var watching = LeisureRules.AtEpisode(wanted, 1, 1, Today).State!;
        Assert.Equal((MediaStatuses.InProgress, (short?)1, (short?)1, (DateOnly?)Today),
            (watching.Status, watching.Season, watching.Episode, watching.StartedOn));

        var later = LeisureRules.AtEpisode(watching, 3, 10, Today).State!;
        Assert.Equal(MediaStatuses.InProgress, later.Status);

        var finished = Item(MediaKinds.Series, MediaStatuses.Finished, season: 3, episode: 10, finishedOn: D(10, 1), rating: 4);
        var rewatch = LeisureRules.AtEpisode(finished, 1, 1, Today).State!;
        Assert.Equal((MediaStatuses.InProgress, (byte?)null, (DateOnly?)null), (rewatch.Status, rewatch.Rating, rewatch.FinishedOn));

        Assert.NotNull(LeisureRules.AtEpisode(Item(MediaKinds.Book), null, 1, Today).Error);
        Assert.NotNull(LeisureRules.AtEpisode(Item(MediaKinds.Podcast), 1, 1, Today).Error);
    }

    [Fact]
    public void Percent_is_a_books_pages_floored_and_100_when_finished()
    {
        Assert.Equal(66, LeisureRules.Percent(MediaKinds.Book, MediaStatuses.InProgress, 300, 199));
        Assert.Equal(99, LeisureRules.Percent(MediaKinds.Book, MediaStatuses.InProgress, 1000, 999));
        Assert.Equal(100, LeisureRules.Percent(MediaKinds.Film, MediaStatuses.Finished, null, 0));
        Assert.Null(LeisureRules.Percent(MediaKinds.Book, MediaStatuses.InProgress, null, 40));
        Assert.Null(LeisureRules.Percent(MediaKinds.Series, MediaStatuses.InProgress, null, 0));
    }

    [Fact]
    public void Logs_and_practice_are_on_days_that_have_come()
    {
        Assert.Null(LeisureRules.CheckLog(Today, Today));
        Assert.NotNull(LeisureRules.CheckLog(Today.AddDays(1), Today));
        Assert.NotNull(LeisureRules.CheckLog(default, Today));
        Assert.Null(LeisureRules.CheckSession(D(1, 5), Today));
        Assert.NotNull(LeisureRules.CheckSession(Today.AddDays(1), Today));
    }
}
