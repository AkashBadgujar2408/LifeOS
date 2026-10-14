using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Calendar.Services;

public class EventLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "Event";

    public string EntityType => Type;

    public string DisplayName => "Event";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.Events
            .Where(e => ids.Contains(e.Id))
            .ToDictionaryAsync(e => e.Id, e => e.Title);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Events.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(e => e.Title.Contains(search));
        }

        return await query
            .OrderByDescending(e => e.CreatedAt)
            .Take(take)
            .Select(e => new LinkableItemDto { EntityType = Type, EntityId = e.Id, Title = e.Title })
            .ToListAsync();
    }
}
