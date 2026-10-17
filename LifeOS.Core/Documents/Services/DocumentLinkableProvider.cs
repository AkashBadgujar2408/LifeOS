using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Documents.Services;

/// <summary>Documents can be linked (a passport ↔ the "Visit Japan" goal), reminded about (expiry) and searched.</summary>
public class DocumentLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "Document";

    public string EntityType => Type;

    public string DisplayName => "Document";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.Documents
            .Where(d => ids.Contains(d.Id))
            .ToDictionaryAsync(d => d.Id, d => d.Title);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Documents.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(d => d.Title.Contains(search) || (d.Issuer != null && d.Issuer.Contains(search)));
        }

        return await query
            .OrderBy(d => d.Title)
            .Take(take)
            .Select(d => new LinkableItemDto { EntityType = Type, EntityId = d.Id, Title = d.Title })
            .ToListAsync();
    }
}
