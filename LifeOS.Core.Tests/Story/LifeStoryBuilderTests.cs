using LifeOS.Core.Story.DTOs;
using LifeOS.Core.Story.Services;

namespace LifeOS.Core.Tests.Story;

public class LifeStoryBuilderTests
{
    private static DateOnly D(int year, int month, int day) => new(year, month, day);

    private static ChapterDto Chapter(int id, DateOnly start, DateOnly? end) =>
        new() { Id = id, Title = $"Chapter {id}", StartDate = start, EndDate = end };

    private static StoryBeatDto Beat(string title, DateOnly day, int? hour = null) => new()
    {
        Kind = StoryBeatKinds.MilestoneDone,
        Title = title,
        Day = day,
        At = hour is null ? null : day.ToDateTime(new TimeOnly(hour.Value, 0), DateTimeKind.Utc),
    };

    private static readonly ChapterDto Student = Chapter(1, D(2018, 7, 1), D(2022, 6, 30));
    private static readonly ChapterDto Job = Chapter(2, D(2023, 1, 1), null);

    [Fact]
    public void No_chapters_puts_everything_in_one_section_oldest_first()
    {
        var sections = LifeStoryBuilder.Build([], [Beat("b", D(2026, 2, 1)), Beat("a", D(2025, 1, 1))]);

        var only = Assert.Single(sections);
        Assert.Null(only.Chapter);
        Assert.Equal(["a", "b"], only.Beats.Select(b => b.Title));
        Assert.Equal((D(2025, 1, 1), D(2026, 2, 1)), (only.From, only.To));
    }

    [Fact]
    public void Beats_fall_into_their_chapter_and_gaps_appear_where_they_happen()
    {
        var sections = LifeStoryBuilder.Build([Job, Student],
        [
            Beat("childhood", D(2010, 5, 1)),
            Beat("graduated", D(2022, 6, 30)),
            Beat("gap", D(2022, 9, 1)),
            Beat("first day", D(2023, 1, 1)),
            Beat("today", D(2026, 10, 15)),
        ]);

        Assert.Equal(
            ["gap: childhood", "1: graduated", "gap: gap", "2: first day,today"],
            sections.Select(s => $"{(s.Chapter is null ? "gap" : s.Chapter.Id.ToString())}: {string.Join(',', s.Beats.Select(b => b.Title))}"));
    }

    [Fact]
    public void Empty_chapters_still_appear_and_empty_gaps_do_not()
    {
        var sections = LifeStoryBuilder.Build([Student, Job], []);

        Assert.Equal([1, 2], sections.Select(s => s.Chapter!.Id));
        Assert.All(sections, s => Assert.Empty(s.Beats));
    }

    [Fact]
    public void A_gap_after_a_closed_last_chapter_comes_last()
    {
        var sections = LifeStoryBuilder.Build([Student], [Beat("later", D(2024, 1, 1))]);

        Assert.Equal(1, sections[0].Chapter!.Id);
        Assert.Null(sections[1].Chapter);
    }

    [Fact]
    public void Same_day_beats_keep_day_only_ones_first_then_by_time()
    {
        var sections = LifeStoryBuilder.Build([], [Beat("evening", D(2026, 1, 1), 18), Beat("morning", D(2026, 1, 1), 6), Beat("day", D(2026, 1, 1))]);

        Assert.Equal(["day", "morning", "evening"], sections[0].Beats.Select(b => b.Title));
    }
}
