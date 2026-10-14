using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Tasks.DTOs;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Tasks.Services;

/// <summary>Lets a project be linked to the goal it serves (or anything else).</summary>
public class ProjectLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "Project";

    public string EntityType => Type;

    public string DisplayName => "Project";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.Projects
            .Where(p => ids.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => p.Name);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Projects.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(p => p.Name.Contains(search));
        }

        // Active projects first: they're what you'd usually link to.
        return await query
            .OrderBy(p => p.Status != ProjectStatuses.Active)
            .ThenBy(p => p.Name)
            .Take(take)
            .Select(p => new LinkableItemDto { EntityType = Type, EntityId = p.Id, Title = p.Name })
            .ToListAsync();
    }
}
