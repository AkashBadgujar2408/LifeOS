using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Goals.Services;
using LifeOS.Core.Learning.DTOs;
using LifeOS.Core.Models;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Learning.Services;

/// <summary>
/// Learning counting toward goals (Session 71f): hours studied for a skill, course or book ("Study Spanish 100
/// hours"), books finished and courses completed (all, or a skill's — "Read 24 books"), and a roadmap's % (a goal
/// following a roadmap, its only source). Study time for a skill follows StudyAnalytics: a session's own skill, else
/// the skill of its course or book — so a course's sessions count for its skill too.
/// </summary>
public class LearningGoalSources(AppDbContext db) : IGoalProgressSource
{
    public const string HoursUnit = "hours";
    public const string BooksUnit = "books";
    public const string CoursesUnit = "courses";

    public IReadOnlyCollection<string> Kinds { get; } =
        [GoalSourceKinds.StudyTime, GoalSourceKinds.BooksFinished, GoalSourceKinds.CoursesCompleted, GoalSourceKinds.Roadmap];

    public async Task<Dictionary<int, SourceDescription>> DescribeAsync(IReadOnlyCollection<GoalSourceRef> sources)
    {
        var names = await NamesAsync(sources);
        var result = new Dictionary<int, SourceDescription>();
        foreach (var s in sources)
        {
            string? name = null;
            if (s.EntityType is { } type && s.EntityId is { } id && !names.TryGetValue((type, id), out name))
            {
                continue; // the item is gone (or someone else's)
            }

            result[s.Id] = s.Kind switch
            {
                GoalSourceKinds.StudyTime => new SourceDescription($"Study time: {name}", HoursUnit),
                GoalSourceKinds.BooksFinished => new SourceDescription(name is null ? "Books finished" : $"Books finished: {name}", BooksUnit),
                GoalSourceKinds.CoursesCompleted => new SourceDescription(name is null ? "Courses completed" : $"Courses completed: {name}", CoursesUnit),
                _ => new SourceDescription($"Roadmap: {name}", GoalSourceRules.PercentUnit),
            };
        }

        return result;
    }

    public async Task<List<SourceAmount>> AmountsAsync(IReadOnlyCollection<GoalSourceRef> sources, DateOnly today)
    {
        var amounts = new List<SourceAmount>();
        var study = sources.Where(s => s.Kind == GoalSourceKinds.StudyTime).ToList();
        if (study.Count > 0)
        {
            var earliest = study.Min(s => s.CountsFrom);
            var sessions = await db.StudySessions
                .Where(x => x.StudiedOn >= earliest && x.StudiedOn <= today)
                .Select(x => new
                {
                    x.StudiedOn, x.Minutes, x.SkillId, x.CourseId, x.BookId,
                    // The skill it serves: its own, else its course's, else its book's.
                    ServesSkillId = x.SkillId ?? (x.Course != null ? x.Course.SkillId : null) ?? (x.Book != null ? x.Book.SkillId : null),
                })
                .ToListAsync();
            foreach (var source in study)
            {
                var matching = source.EntityType switch
                {
                    SkillLinkableProvider.Type => sessions.Where(x => x.ServesSkillId == source.EntityId),
                    CourseLinkableProvider.Type => sessions.Where(x => x.CourseId == source.EntityId),
                    _ => sessions.Where(x => x.BookId == source.EntityId),
                };
                amounts.AddRange(matching
                    .Where(x => x.StudiedOn >= source.CountsFrom)
                    .GroupBy(x => x.StudiedOn)
                    .Select(g => new SourceAmount(source.Id, g.Key, Hours(g.Sum(x => x.Minutes)))));
            }
        }

        foreach (var source in sources.Where(s => s.Kind == GoalSourceKinds.BooksFinished))
        {
            var books = await db.Books
                .Where(b => b.Status == BookStatuses.Finished && b.FinishedOn != null
                    && b.FinishedOn >= source.CountsFrom && b.FinishedOn <= today
                    && (source.EntityId == null || b.SkillId == source.EntityId))
                .Select(b => b.FinishedOn!.Value)
                .ToListAsync();
            amounts.AddRange(books.GroupBy(d => d).Select(g => new SourceAmount(source.Id, g.Key, g.Count())));
        }

        foreach (var source in sources.Where(s => s.Kind == GoalSourceKinds.CoursesCompleted))
        {
            var courses = await db.Courses
                .Where(c => c.Status == CourseStatuses.Completed && c.CompletedOn != null
                    && c.CompletedOn >= source.CountsFrom && c.CompletedOn <= today
                    && (source.EntityId == null || c.SkillId == source.EntityId))
                .Select(c => c.CompletedOn!.Value)
                .ToListAsync();
            amounts.AddRange(courses.GroupBy(d => d).Select(g => new SourceAmount(source.Id, g.Key, g.Count())));
        }

        // A roadmap is a state, not a count: its % today (counting-from doesn't apply).
        var roadmapSources = sources.Where(s => s.Kind == GoalSourceKinds.Roadmap && s.EntityId is not null).ToList();
        if (roadmapSources.Count > 0)
        {
            var ids = roadmapSources.Select(s => s.EntityId!.Value).ToList();
            var roadmaps = await db.Roadmaps
                .Where(r => ids.Contains(r.Id))
                .Select(r => new { r.Id, r.Status, Steps = r.RoadmapSteps.Count, Done = r.RoadmapSteps.Count(s => s.CompletedAt != null) })
                .ToDictionaryAsync(r => r.Id);
            foreach (var source in roadmapSources)
            {
                if (roadmaps.TryGetValue(source.EntityId!.Value, out var r))
                {
                    var percent = RoadmapProgress.Percent(r.Status, r.Steps, r.Done);
                    if (percent > 0)
                    {
                        amounts.Add(new SourceAmount(source.Id, today, percent));
                    }
                }
            }
        }

        return amounts;
    }

    public async Task<List<GoalSourceOptionDto>> OptionsAsync()
    {
        var skills = await db.Skills.OrderBy(s => s.Name).Select(s => new { s.Id, s.Name }).ToListAsync();
        var courses = await db.Courses.Where(c => c.Status != CourseStatuses.Dropped)
            .OrderBy(c => c.Title).Select(c => new { c.Id, c.Title }).ToListAsync();
        var books = await db.Books.Where(b => b.Status != BookStatuses.Abandoned)
            .OrderBy(b => b.Title).Select(b => new { b.Id, b.Title }).ToListAsync();
        var roadmaps = await db.Roadmaps.Where(r => r.Status != RoadmapStatuses.Archived)
            .OrderBy(r => r.Title).Select(r => new { r.Id, r.Title }).ToListAsync();

        var options = new List<GoalSourceOptionDto>();
        options.AddRange(skills.Select(s => Option(GoalSourceKinds.StudyTime, SkillLinkableProvider.Type, s.Id, $"Study time: {s.Name}", HoursUnit)));
        options.AddRange(courses.Select(c => Option(GoalSourceKinds.StudyTime, CourseLinkableProvider.Type, c.Id, $"Study time: {c.Title}", HoursUnit)));
        options.AddRange(books.Select(b => Option(GoalSourceKinds.StudyTime, BookLinkableProvider.Type, b.Id, $"Study time: {b.Title}", HoursUnit)));
        options.Add(Option(GoalSourceKinds.BooksFinished, null, null, "Books finished (any)", BooksUnit));
        options.AddRange(skills.Select(s => Option(GoalSourceKinds.BooksFinished, SkillLinkableProvider.Type, s.Id, $"Books finished: {s.Name}", BooksUnit)));
        options.Add(Option(GoalSourceKinds.CoursesCompleted, null, null, "Courses completed (any)", CoursesUnit));
        options.AddRange(skills.Select(s => Option(GoalSourceKinds.CoursesCompleted, SkillLinkableProvider.Type, s.Id, $"Courses completed: {s.Name}", CoursesUnit)));
        options.AddRange(roadmaps.Select(r => Option(GoalSourceKinds.Roadmap, RoadmapLinkableProvider.Type, r.Id, $"Roadmap: {r.Title}", GoalSourceRules.PercentUnit)));
        return options;
    }

    /// <summary>Minutes as hours, to 2 decimals (90 → 1.5).</summary>
    internal static decimal Hours(int minutes) => Math.Round(minutes / 60m, 2, MidpointRounding.AwayFromZero);

    private static GoalSourceOptionDto Option(string kind, string? entityType, int? entityId, string title, string unit) =>
        new() { Kind = kind, EntityType = entityType, EntityId = entityId, Title = title, Unit = unit };

    /// <summary>Names of the skills, courses, books and roadmaps the sources point at (missing ones left out).</summary>
    private async Task<Dictionary<(string Type, int Id), string>> NamesAsync(IReadOnlyCollection<GoalSourceRef> sources)
    {
        List<int> Ids(string type) =>
            sources.Where(s => s.EntityType == type && s.EntityId is not null).Select(s => s.EntityId!.Value).Distinct().ToList();

        var names = new Dictionary<(string, int), string>();
        var skillIds = Ids(SkillLinkableProvider.Type);
        foreach (var s in await db.Skills.Where(x => skillIds.Contains(x.Id)).Select(x => new { x.Id, x.Name }).ToListAsync())
        {
            names[(SkillLinkableProvider.Type, s.Id)] = s.Name;
        }

        var courseIds = Ids(CourseLinkableProvider.Type);
        foreach (var c in await db.Courses.Where(x => courseIds.Contains(x.Id)).Select(x => new { x.Id, x.Title }).ToListAsync())
        {
            names[(CourseLinkableProvider.Type, c.Id)] = c.Title;
        }

        var bookIds = Ids(BookLinkableProvider.Type);
        foreach (var b in await db.Books.Where(x => bookIds.Contains(x.Id)).Select(x => new { x.Id, x.Title }).ToListAsync())
        {
            names[(BookLinkableProvider.Type, b.Id)] = b.Title;
        }

        var roadmapIds = Ids(RoadmapLinkableProvider.Type);
        foreach (var r in await db.Roadmaps.Where(x => roadmapIds.Contains(x.Id)).Select(x => new { x.Id, x.Title }).ToListAsync())
        {
            names[(RoadmapLinkableProvider.Type, r.Id)] = r.Title;
        }

        return names;
    }
}
