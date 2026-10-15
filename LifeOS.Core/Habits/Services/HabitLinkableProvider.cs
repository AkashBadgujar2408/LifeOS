using LifeOS.Core.Habits.DTOs;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Habits.Services;

/// <summary>Lets a habit be linked to the goal it supports (or anything else).</summary>
public class HabitLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "Habit";

    public string EntityType => Type;

    public string DisplayName => "Habit";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.Habits
            .Where(h => ids.Contains(h.Id))
            .ToDictionaryAsync(h => h.Id, h => h.Title);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Habits.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(h => h.Title.Contains(search));
        }

        // Active habits first: archived ones are rarely what you're linking.
        return await query
            .OrderBy(h => h.Status != HabitStatuses.Active)
            .ThenBy(h => h.Title)
            .Take(take)
            .Select(h => new LinkableItemDto { EntityType = Type, EntityId = h.Id, Title = h.Title })
            .ToListAsync();
    }
}
