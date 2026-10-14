using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Shared.Services;

public class InboxLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "InboxItem";

    public string EntityType => Type;

    public string DisplayName => "Inbox item";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.InboxItems
            .Where(i => ids.Contains(i.Id))
            .ToDictionaryAsync(i => i.Id, i => i.Title);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.InboxItems.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(i => i.Title.Contains(search));
        }

        return await query
            .OrderByDescending(i => i.CreatedAt)
            .Take(take)
            .Select(i => new LinkableItemDto { EntityType = Type, EntityId = i.Id, Title = i.Title })
            .ToListAsync();
    }
}
