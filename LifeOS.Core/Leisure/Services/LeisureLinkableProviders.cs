using LifeOS.Core.Leisure.DTOs;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Leisure.Services;

/// <summary>Media items (books included) can be linked, reminded about and found by search — by a highlight too.</summary>
public class MediaItemLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "MediaItem";

    public string EntityType => Type;

    public string DisplayName => "Book or media";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.MediaItems.Where(m => ids.Contains(m.Id)).Select(m => new { m.Id, m.Title }).ToDictionaryAsync(m => m.Id, m => m.Title);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.MediaItems.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            // A highlight remembered word for word finds its item too.
            query = query.Where(m => m.Title.Contains(search)
                || (m.Creator != null && m.Creator.Contains(search))
                || m.MediaNotes.Any(n => !n.IsDeleted && n.Text.Contains(search)));
        }

        return await query
            .OrderBy(m => m.Status != MediaStatuses.InProgress)
            .ThenBy(m => m.Title)
            .Take(take)
            .Select(m => new LinkableItemDto { EntityType = Type, EntityId = m.Id, Title = m.Title })
            .ToListAsync();
    }
}

public class HobbyLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "Hobby";

    public string EntityType => Type;

    public string DisplayName => "Hobby";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.Hobbies.Where(h => ids.Contains(h.Id)).Select(h => new { h.Id, h.Name }).ToDictionaryAsync(h => h.Id, h => h.Name);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Hobbies.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(h => h.Name.Contains(search) || (h.Description != null && h.Description.Contains(search)));
        }

        return await query
            .OrderBy(h => h.Status != HobbyStatuses.Active)
            .ThenBy(h => h.Name)
            .Take(take)
            .Select(h => new LinkableItemDto { EntityType = Type, EntityId = h.Id, Title = h.Name })
            .ToListAsync();
    }
}
