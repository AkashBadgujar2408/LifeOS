using LifeOS.Core.Leisure.DTOs;

namespace LifeOS.Core.Leisure.Services;

/// <summary>A media item's progress fields as stored — everything <c>LeisureRules</c> keeps consistent.</summary>
public record MediaState(
    string Kind,
    string Status,
    bool UpNext,
    int? TotalPages,
    int CurrentPage,
    short? Season,
    short? Episode,
    DateOnly? StartedOn,
    DateOnly? FinishedOn,
    byte? Rating,
    string? Review);

/// <summary>
/// The rules of the media backlog (Session 78a, books' rules from Learning folded in): what each kind can track
/// (pages for a book, season/episode for a series, episode for a podcast), what a status brings with it (started
/// today, finished today, a book's last page), and that a rating or review belongs to something finished or dropped.
/// Mirrors the CK_MediaItems_* constraints so the API answers with a sentence instead of a constraint error.
/// </summary>
public static class LeisureRules
{
    /// <summary>Returns the state to store, or an error message.</summary>
    public static (MediaState? State, string? Error) Check(MediaState item, DateOnly today)
    {
        var (kind, status, upNext, totalPages, currentPage, season, episode, startedOn, finishedOn, rating, review) = item;
        if (kind != MediaKinds.Book && (totalPages is not null || currentPage != 0))
        {
            return (null, "Only a book has pages.");
        }

        if (!MediaKinds.HasEpisodes(kind) && (season is not null || episode is not null))
        {
            return (null, "Only a series or a podcast has episodes.");
        }

        if (kind == MediaKinds.Podcast && season is not null)
        {
            return (null, "A podcast has episodes but no seasons.");
        }

        if (totalPages is { } total && currentPage > total)
        {
            return (null, $"The current page can't be past the last one ({total}).");
        }

        switch (status)
        {
            case MediaStatuses.Finished:
                finishedOn ??= today;
                currentPage = totalPages ?? currentPage;
                break;
            case MediaStatuses.InProgress:
                startedOn ??= today;
                finishedOn = null;
                break;
            default:
                finishedOn = null;
                break;
        }

        if (finishedOn is { } done && done > today)
        {
            return (null, "It can't be finished on a day that hasn't come yet.");
        }

        if (startedOn is { } started && finishedOn is { } finished && finished < started)
        {
            return (null, "It can't be finished before it was started.");
        }

        review = string.IsNullOrWhiteSpace(review) ? null : review.Trim();
        if ((rating is not null || review is not null) && status is not (MediaStatuses.Finished or MediaStatuses.Dropped))
        {
            return (null, "Rate or review it once you've finished it (or dropped it).");
        }

        // "Up next" is a place on the backlog: anything started or done has left it.
        upNext = upNext && status == MediaStatuses.Want;
        return (new MediaState(kind, status, upNext, totalPages, currentPage, season, episode, startedOn, finishedOn,
            rating, review), null);
    }

    /// <summary>
    /// Moves a book to <paramref name="page"/>: one not yet started starts today, the last page finishes it, going back
    /// from the end of a finished book makes it In progress again (and sets its rating and review aside).
    /// </summary>
    public static (MediaState? State, string? Error) AtPage(MediaState item, int page, DateOnly today)
    {
        if (item.Kind != MediaKinds.Book)
        {
            return (null, "Only a book has pages.");
        }

        if (page < 0)
        {
            return (null, "The current page is 0 or more.");
        }

        var status = item.Status;
        if (item.TotalPages is { } total && page >= total)
        {
            if (page > total)
            {
                return (null, $"The current page can't be past the last one ({total}).");
            }

            status = MediaStatuses.Finished;
        }
        else if (page > 0 && status is MediaStatuses.Want or MediaStatuses.Finished)
        {
            status = MediaStatuses.InProgress;
        }

        return Check(Moved(item, status) with { CurrentPage = page }, today);
    }

    /// <summary>
    /// Moves a series or podcast to an episode: starts one not yet started, and watching a finished one again makes it
    /// In progress (episode counts aren't known, so an episode never finishes anything — that's the user's call).
    /// </summary>
    public static (MediaState? State, string? Error) AtEpisode(MediaState item, short? season, short episode, DateOnly today)
    {
        if (!MediaKinds.HasEpisodes(item.Kind))
        {
            return (null, "Only a series or a podcast has episodes.");
        }

        if (episode < 0)
        {
            return (null, "The episode is 0 or more.");
        }

        var status = item.Status is MediaStatuses.Want or MediaStatuses.Finished && episode > 0
            ? MediaStatuses.InProgress
            : item.Status;
        return Check(Moved(item, status) with { Season = season, Episode = episode }, today);
    }

    /// <summary>How far through: a finished item is 100, a book its pages read (floor, so 99.5% never reads 100), else null.</summary>
    public static int? Percent(string kind, string status, int? totalPages, int currentPage)
    {
        if (status == MediaStatuses.Finished)
        {
            return 100;
        }

        return kind == MediaKinds.Book && totalPages is { } total && total > 0
            ? Math.Min(currentPage, total) * 100 / total
            : null;
    }

    /// <summary>A logged watch / play / listen: on a day that has come, with a length if one is given.</summary>
    public static string? CheckLog(DateOnly loggedOn, DateOnly today) =>
        loggedOn == default ? "Say which day." : loggedOn > today ? "Log it on a day that has come." : null;

    /// <summary>A hobby practice session: on a day that has come.</summary>
    public static string? CheckSession(DateOnly practicedOn, DateOnly today) =>
        practicedOn == default ? "Say which day." : practicedOn > today ? "Log practice on a day that has come." : null;

    // Changing status by progress: leaving Finished drops its day (Check refills it), a rating and review belong to a
    // finished or dropped item only.
    private static MediaState Moved(MediaState item, string status) =>
        status == item.Status
            ? item
            : item with
            {
                Status = status,
                FinishedOn = null,
                Rating = status is MediaStatuses.Finished or MediaStatuses.Dropped ? item.Rating : null,
                Review = status is MediaStatuses.Finished or MediaStatuses.Dropped ? item.Review : null,
            };
}
