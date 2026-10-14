using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Goals.Services;

public class GoalLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "Goal";

    public string EntityType => Type;

    public string DisplayName => "Goal";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.Goals
            .Where(g => ids.Contains(g.Id))
            .ToDictionaryAsync(g => g.Id, g => g.Title);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Goals.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(g => g.Title.Contains(search));
        }

        return await query
            .OrderByDescending(g => g.CreatedAt)
            .Take(take)
            .Select(g => new LinkableItemDto { EntityType = Type, EntityId = g.Id, Title = g.Title })
            .ToListAsync();
    }
}
