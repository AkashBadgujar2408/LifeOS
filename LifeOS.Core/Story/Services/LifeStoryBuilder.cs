using LifeOS.Core.Story.DTOs;

namespace LifeOS.Core.Story.Services;

/// <summary>
/// Files story beats into chapters, oldest first. Pure, unit-tested. Every chapter appears (even before anything
/// happened in it — a chapter you named is part of the story); beats on days no chapter covers are gathered into
/// chapterless sections in the gaps where they fall (before the first chapter, between two, after the last), and
/// empty gaps are left out.
/// </summary>
public static class LifeStoryBuilder
{
    // Within a day: things that happened at a known moment in that order, day-only beats first (a habit that
    // "started on" a day began before the day's events).
    public static List<StorySectionDto> Build(IReadOnlyList<ChapterDto> chapters, IEnumerable<StoryBeatDto> beats)
    {
        var ordered = chapters.OrderBy(c => c.StartDate).ToList();
        var sorted = beats
            .OrderBy(b => b.Day)
            // An achievement closes its day: it follows whatever earned it.
            .ThenBy(b => b.Kind == StoryBeatKinds.AchievementUnlocked)
            .ThenBy(b => b.At ?? DateTime.MinValue)
            .ThenBy(b => b.Kind, StringComparer.Ordinal)
            .ToList();

        var byChapter = ordered.ToDictionary(c => c.Id, _ => new List<StoryBeatDto>());
        // Gap k sits before chapter k (gap ordered.Count is after the last one).
        var gaps = Enumerable.Range(0, ordered.Count + 1).Select(_ => new List<StoryBeatDto>()).ToList();

        foreach (var beat in sorted)
        {
            var chapter = ordered.FirstOrDefault(c => c.StartDate <= beat.Day && beat.Day <= (c.EndDate ?? DateOnly.MaxValue));
            if (chapter is not null)
            {
                byChapter[chapter.Id].Add(beat);
            }
            else
            {
                gaps[ordered.Count(c => c.StartDate <= beat.Day)].Add(beat);
            }
        }

        var sections = new List<StorySectionDto>();
        for (var k = 0; k <= ordered.Count; k++)
        {
            if (gaps[k].Count > 0)
            {
                sections.Add(new StorySectionDto { From = gaps[k][0].Day, To = gaps[k][^1].Day, Beats = gaps[k] });
            }

            if (k < ordered.Count)
            {
                sections.Add(new StorySectionDto { Chapter = ordered[k], Beats = byChapter[ordered[k].Id] });
            }
        }

        return sections;
    }
}
