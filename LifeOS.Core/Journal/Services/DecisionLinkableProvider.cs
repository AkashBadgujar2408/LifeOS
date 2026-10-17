using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Journal.Services;

/// <summary>Lets a decision be linked (to the goal it was about), reminded about (its review) and found by search.</summary>
public class DecisionLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "Decision";

    public string EntityType => Type;

    public string DisplayName => "Decision";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.Decisions.Where(d => ids.Contains(d.Id)).ToDictionaryAsync(d => d.Id, d => d.Title);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Decisions.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(d => d.Title.Contains(search)
                                     || (d.Reasons != null && d.Reasons.Contains(search))
                                     || (d.ExpectedOutcome != null && d.ExpectedOutcome.Contains(search))
                                     || (d.ActualOutcome != null && d.ActualOutcome.Contains(search)));
        }

        return await query
            .OrderByDescending(d => d.DecidedOn).ThenByDescending(d => d.Id)
            .Take(take)
            .Select(d => new LinkableItemDto { EntityType = Type, EntityId = d.Id, Title = d.Title })
            .ToListAsync();
    }
}
