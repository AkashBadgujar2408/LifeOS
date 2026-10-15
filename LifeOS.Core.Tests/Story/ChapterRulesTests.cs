using LifeOS.Core.Story.Services;

namespace LifeOS.Core.Tests.Story;

public class ChapterRulesTests
{
    private static DateOnly D(int year, int month, int day) => new(year, month, day);

    private static readonly ChapterSpan Student = new(1, "Student years", D(2018, 7, 1), D(2022, 6, 30));
    private static readonly ChapterSpan FirstJob = new(2, "First job", D(2022, 7, 1), null);

    [Fact]
    public void A_first_chapter_is_fine_open_or_closed()
    {
        Assert.True(ChapterRules.Check([], new ChapterSpan(0, "Now", D(2026, 1, 1), null)).Ok);
        Assert.True(ChapterRules.Check([], new ChapterSpan(0, "Then", D(2010, 1, 1), D(2012, 1, 1))).Ok);
    }

    [Fact]
    public void Ending_before_starting_is_rejected()
    {
        var check = ChapterRules.Check([], new ChapterSpan(0, "Backwards", D(2020, 5, 1), D(2020, 4, 30)));
        Assert.Equal("A chapter can't end before it starts.", check.Error);
    }

    [Fact]
    public void A_one_day_chapter_is_allowed()
    {
        Assert.True(ChapterRules.Check([Student], new ChapterSpan(0, "Graduation day", D(2017, 6, 1), D(2017, 6, 1))).Ok);
    }

    [Fact]
    public void A_new_current_chapter_turns_the_page_on_the_open_one()
    {
        var check = ChapterRules.Check([Student, FirstJob], new ChapterSpan(0, "Moved to Pune", D(2025, 3, 1), null));

        Assert.True(check.Ok);
        Assert.Equal(2, check.CloseChapterId);
        Assert.Equal(D(2025, 2, 28), check.CloseOn);
    }

    [Fact]
    public void A_new_current_chapter_cannot_start_before_the_one_you_are_in()
    {
        var check = ChapterRules.Check([Student, FirstJob], new ChapterSpan(0, "Earlier", D(2022, 7, 1), null));

        Assert.False(check.Ok);
        Assert.Contains("First job", check.Error);
        Assert.Null(check.CloseChapterId);
    }

    [Fact]
    public void A_closed_chapter_inside_the_current_one_is_rejected_by_name()
    {
        var check = ChapterRules.Check([Student, FirstJob], new ChapterSpan(0, "Sabbatical", D(2024, 1, 1), D(2024, 6, 30)));

        Assert.False(check.Ok);
        Assert.Contains("\"First job\" (since 01/Jul/2022)", check.Error);
    }

    [Fact]
    public void Touching_end_to_start_is_not_an_overlap_but_sharing_a_day_is()
    {
        Assert.True(ChapterRules.Check([Student], new ChapterSpan(0, "Gap year", D(2017, 7, 1), D(2018, 6, 30))).Ok);

        var shared = ChapterRules.Check([Student], new ChapterSpan(0, "Gap year", D(2017, 7, 1), D(2018, 7, 1)));
        Assert.Contains("\"Student years\" (01/Jul/2018 – 30/Jun/2022)", shared.Error);
    }

    [Fact]
    public void Editing_a_chapter_is_checked_against_the_others_only()
    {
        // Moving Student years' end a day later (the caller leaves the chapter itself out of `others`).
        var edited = Student with { End = D(2022, 6, 30) };
        Assert.True(ChapterRules.Check([FirstJob], edited).Ok);

        // ...but not into First job.
        Assert.False(ChapterRules.Check([FirstJob], Student with { End = D(2022, 7, 1) }).Ok);
    }

    [Fact]
    public void A_day_belongs_to_at_most_one_chapter()
    {
        ChapterSpan[] chapters = [Student, FirstJob];

        Assert.Equal(1, ChapterRules.On(chapters, D(2020, 1, 1))!.Id);
        Assert.Equal(2, ChapterRules.On(chapters, D(2026, 10, 15))!.Id);
        Assert.Equal(2, ChapterRules.On(chapters, D(2022, 7, 1))!.Id);
        Assert.Null(ChapterRules.On(chapters, D(2010, 1, 1)));
    }

    [Theory]
    [InlineData(2026, 10, 15, 2026, 10, 1)]
    [InlineData(2026, 10, 1, 2026, 10, 1)]
    [InlineData(2028, 2, 29, 2028, 2, 1)]
    public void Month_start_is_the_first_of_the_month(int y, int m, int d, int ey, int em, int ed)
    {
        Assert.Equal(D(ey, em, ed), ChapterRules.MonthStart(D(y, m, d)));
    }
}
