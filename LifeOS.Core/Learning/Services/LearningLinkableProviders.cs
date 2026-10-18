using LifeOS.Core.Learning.DTOs;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Learning.Services;

/// <summary>Skills can be linked to goals, tasks and the rest, set reminders on, and found by search.</summary>
public class SkillLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "Skill";

    public string EntityType => Type;

    public string DisplayName => "Skill";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.Skills.Where(s => ids.Contains(s.Id)).ToDictionaryAsync(s => s.Id, s => s.Name);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Skills.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(s => s.Name.Contains(search) || (s.Description != null && s.Description.Contains(search)));
        }

        return await query
            .OrderBy(s => s.Name)
            .Take(take)
            .Select(s => new LinkableItemDto { EntityType = Type, EntityId = s.Id, Title = s.Name })
            .ToListAsync();
    }
}

public class CourseLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "Course";

    public string EntityType => Type;

    public string DisplayName => "Course";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.Courses.Where(c => ids.Contains(c.Id)).ToDictionaryAsync(c => c.Id, c => c.Title);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Courses.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(c => c.Title.Contains(search) || (c.Provider != null && c.Provider.Contains(search)));
        }

        // Courses under way first: they're what you'd usually link to.
        return await query
            .OrderBy(c => c.Status != CourseStatuses.InProgress)
            .ThenBy(c => c.Title)
            .Take(take)
            .Select(c => new LinkableItemDto { EntityType = Type, EntityId = c.Id, Title = c.Title })
            .ToListAsync();
    }
}

public class BookLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "Book";

    public string EntityType => Type;

    public string DisplayName => "Book";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.Books.Where(b => ids.Contains(b.Id)).ToDictionaryAsync(b => b.Id, b => b.Title);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Books.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            // A highlight remembered word for word finds its book too.
            query = query.Where(b => b.Title.Contains(search)
                || (b.Author != null && b.Author.Contains(search))
                || b.BookNotes.Any(n => n.Text.Contains(search)));
        }

        return await query
            .OrderBy(b => b.Status != BookStatuses.Reading)
            .ThenBy(b => b.Title)
            .Take(take)
            .Select(b => new LinkableItemDto { EntityType = Type, EntityId = b.Id, Title = b.Title })
            .ToListAsync();
    }
}

public class RoadmapLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "Roadmap";

    public string EntityType => Type;

    public string DisplayName => "Roadmap";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.Roadmaps.Where(r => ids.Contains(r.Id)).ToDictionaryAsync(r => r.Id, r => r.Title);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Roadmaps.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(r => r.Title.Contains(search) || r.RoadmapSteps.Any(s => s.Title.Contains(search)));
        }

        return await query
            .OrderBy(r => r.Status != RoadmapStatuses.Active)
            .ThenBy(r => r.Title)
            .Take(take)
            .Select(r => new LinkableItemDto { EntityType = Type, EntityId = r.Id, Title = r.Title })
            .ToListAsync();
    }
}

public class CertificationLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "Certification";

    public string EntityType => Type;

    public string DisplayName => "Certification";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.Certifications.Where(c => ids.Contains(c.Id)).ToDictionaryAsync(c => c.Id, c => c.Name);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Certifications.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(c => c.Name.Contains(search) || (c.Issuer != null && c.Issuer.Contains(search)));
        }

        return await query
            .OrderBy(c => c.Name)
            .Take(take)
            .Select(c => new LinkableItemDto { EntityType = Type, EntityId = c.Id, Title = c.Name })
            .ToListAsync();
    }
}
