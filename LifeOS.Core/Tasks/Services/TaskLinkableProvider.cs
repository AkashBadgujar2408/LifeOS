using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Tasks.Services;

public class TaskLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "Task";

    public string EntityType => Type;

    public string DisplayName => "Task";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.TaskItems
            .Where(t => ids.Contains(t.Id))
            .ToDictionaryAsync(t => t.Id, t => t.Title);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.TaskItems.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(t => t.Title.Contains(search));
        }

        // Open tasks first: they're what you'd usually link to.
        return await query
            .OrderBy(t => t.Status == "Done")
            .ThenByDescending(t => t.CreatedAt)
            .Take(take)
            .Select(t => new LinkableItemDto { EntityType = Type, EntityId = t.Id, Title = t.Title })
            .ToListAsync();
    }
}
