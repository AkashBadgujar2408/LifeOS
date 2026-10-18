using LifeOS.Core.Learning.DTOs;
using LifeOS.Core.Learning.Services;

namespace LifeOS.Core.Tests.Learning;

public class LearningRulesTests
{
    private static readonly DateOnly Today = new(2026, 10, 18);

    private static DateOnly D(int month, int day) => new(2026, month, day);

    [Fact]
    public void Completing_a_course_fills_in_today_and_100_percent()
    {
        var (state, error) = LearningRules.Course(CourseStatuses.Completed, 70, D(9, 1), null, Today);

        Assert.Null(error);
        Assert.Equal(new CourseState(CourseStatuses.Completed, 100, D(9, 1), Today), state);
    }

    [Fact]
    public void Starting_a_course_dates_it_and_leaving_completed_clears_the_day()
    {
        Assert.Equal(Today, LearningRules.Course(CourseStatuses.InProgress, 10, null, null, Today).State!.StartedOn);
        Assert.Null(LearningRules.Course(CourseStatuses.InProgress, 90, D(9, 1), D(10, 1), Today).State!.CompletedOn);
        Assert.Null(LearningRules.Course(CourseStatuses.Planned, 0, null, null, Today).State!.StartedOn);
    }

    [Fact]
    public void A_course_cant_end_before_it_began()
    {
        Assert.NotNull(LearningRules.Course(CourseStatuses.Completed, 100, D(10, 10), D(10, 1), Today).Error);
    }

    [Fact]
    public void Finishing_a_book_moves_to_the_last_page_and_dates_it()
    {
        var (state, error) = LearningRules.Book(BookStatuses.Finished, 320, 200, D(9, 1), null, 4, Today);

        Assert.Null(error);
        Assert.Equal(new BookState(BookStatuses.Finished, 320, 320, D(9, 1), Today, 4), state);
    }

    [Fact]
    public void Book_rules_refuse_what_cant_be_true()
    {
        Assert.NotNull(LearningRules.Book(BookStatuses.Reading, 100, 101, null, null, null, Today).Error);
        Assert.NotNull(LearningRules.Book(BookStatuses.Reading, 100, 10, null, null, 5, Today).Error);
        Assert.NotNull(LearningRules.Book(BookStatuses.Finished, 100, 100, D(10, 10), D(10, 1), null, Today).Error);
        // Giving up on a book can still be rated.
        Assert.Null(LearningRules.Book(BookStatuses.Abandoned, 100, 40, D(9, 1), null, 2, Today).Error);
    }

    [Fact]
    public void Turning_pages_starts_and_finishes_a_book()
    {
        var unread = new BookState(BookStatuses.WantToRead, 300, 0, null, null, null);

        var started = LearningRules.AtPage(unread, 25, Today).State!;
        Assert.Equal((BookStatuses.Reading, 25, (DateOnly?)Today), (started.Status, started.CurrentPage, started.StartedOn));

        var finished = LearningRules.AtPage(started, 300, Today.AddDays(9)).State!;
        Assert.Equal((BookStatuses.Finished, (DateOnly?)Today.AddDays(9)), (finished.Status, finished.FinishedOn));

        Assert.NotNull(LearningRules.AtPage(started, 301, Today).Error);
    }

    [Fact]
    public void Going_back_from_the_last_page_reopens_a_finished_book()
    {
        var finished = new BookState(BookStatuses.Finished, 300, 300, D(9, 1), D(10, 1), 5);

        var reopened = LearningRules.AtPage(finished, 120, Today).State!;

        Assert.Equal(new BookState(BookStatuses.Reading, 300, 120, D(9, 1), null, null), reopened);
    }

    [Fact]
    public void Book_percent_floors_and_needs_a_page_count()
    {
        Assert.Equal(66, LearningRules.BookPercent(BookStatuses.Reading, 300, 199));
        Assert.Equal(99, LearningRules.BookPercent(BookStatuses.Reading, 1000, 999));
        Assert.Equal(100, LearningRules.BookPercent(BookStatuses.Finished, null, 0));
        Assert.Null(LearningRules.BookPercent(BookStatuses.Reading, null, 40));
    }
}
