using LifeOS.Core.Learning.DTOs;

namespace LifeOS.Core.Learning.Services;

/// <summary>A course's state once the rules have been applied (what gets stored).</summary>
public record CourseState(string Status, byte ProgressPercent, DateOnly? StartedOn, DateOnly? CompletedOn);

/// <summary>A book's state once the rules have been applied (what gets stored).</summary>
public record BookState(string Status, int? TotalPages, int CurrentPage, DateOnly? StartedOn, DateOnly? FinishedOn, byte? Rating);

/// <summary>
/// The rules that keep a course or a book consistent with the CHECK constraints in 10_learning.sql, applied the
/// friendly way where the intent is clear (marking a course Completed fills in today and 100%; reaching the last page
/// finishes a book) and refused with a message where it isn't. Pure, so tested.
/// </summary>
public static class LearningRules
{
    /// <summary>Returns the state to store, or an error message.</summary>
    public static (CourseState? State, string? Error) Course(
        string status, byte progressPercent, DateOnly? startedOn, DateOnly? completedOn, DateOnly today)
    {
        if (progressPercent > 100)
        {
            return (null, "Progress is 0 to 100%.");
        }

        switch (status)
        {
            case CourseStatuses.Completed:
                completedOn ??= today;
                progressPercent = 100;
                break;
            case CourseStatuses.InProgress:
                startedOn ??= today;
                completedOn = null;
                break;
            default:
                completedOn = null;
                break;
        }

        if (startedOn is { } started && completedOn is { } completed && completed < started)
        {
            return (null, "A course can't be completed before it started.");
        }

        return (new CourseState(status, progressPercent, startedOn, completedOn), null);
    }

    /// <summary>Returns the state to store, or an error message.</summary>
    public static (BookState? State, string? Error) Book(
        string status, int? totalPages, int currentPage, DateOnly? startedOn, DateOnly? finishedOn, byte? rating, DateOnly today)
    {
        if (totalPages is { } total && currentPage > total)
        {
            return (null, $"The current page can't be past the last one ({total}).");
        }

        switch (status)
        {
            case BookStatuses.Finished:
                finishedOn ??= today;
                currentPage = totalPages ?? currentPage;
                break;
            case BookStatuses.Reading:
                startedOn ??= today;
                finishedOn = null;
                break;
            default:
                finishedOn = null;
                break;
        }

        if (rating is not null && status is not (BookStatuses.Finished or BookStatuses.Abandoned))
        {
            return (null, "Rate a book once you've finished it (or given up on it).");
        }

        if (startedOn is { } started && finishedOn is { } finished && finished < started)
        {
            return (null, "A book can't be finished before it was started.");
        }

        return (new BookState(status, totalPages, currentPage, startedOn, finishedOn, rating), null);
    }

    /// <summary>
    /// Moves a book to <paramref name="page"/>: a book not yet started starts today, and the last page finishes it.
    /// Going back from the last page of a finished book makes it Reading again.
    /// </summary>
    public static (BookState? State, string? Error) AtPage(BookState book, int page, DateOnly today)
    {
        if (page < 0)
        {
            return (null, "The current page is 0 or more.");
        }

        var status = book.Status;
        if (book.TotalPages is { } total && page >= total)
        {
            if (page > total)
            {
                return (null, $"The current page can't be past the last one ({total}).");
            }

            status = BookStatuses.Finished;
        }
        else if (page > 0 && status is BookStatuses.WantToRead or BookStatuses.Finished)
        {
            status = BookStatuses.Reading;
        }

        // A rating belongs to a finished (or abandoned) book; reading it again sets it aside.
        var rating = status is BookStatuses.Finished or BookStatuses.Abandoned ? book.Rating : null;
        return Book(status, book.TotalPages, page, book.StartedOn, status == book.Status ? book.FinishedOn : null, rating, today);
    }

    /// <summary>How far through a book is (floor, so 99.5% never reads 100); a finished book is 100, no page count → null.</summary>
    public static int? BookPercent(string status, int? totalPages, int currentPage)
    {
        if (status == BookStatuses.Finished)
        {
            return 100;
        }

        return totalPages is { } total && total > 0 ? Math.Min(currentPage, total) * 100 / total : null;
    }
}
