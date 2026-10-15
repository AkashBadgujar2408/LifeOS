using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Shared.Services;

public class EntityLinksService(AppDbContext db, IEnumerable<ILinkableEntityProvider> providers) : IEntityLinksService
{
    private const int SearchResultLimit = 20;
    private const string DuplicateLinkError = "These items are already linked.";

    private readonly Dictionary<string, ILinkableEntityProvider> providersByType =
        providers.ToDictionary(p => p.EntityType, StringComparer.OrdinalIgnoreCase);

    public List<LinkableTypeDto> GetLinkableTypes() =>
        providersByType.Values
            .OrderBy(p => p.DisplayName)
            .Select(p => new LinkableTypeDto { EntityType = p.EntityType, DisplayName = p.DisplayName })
            .ToList();

    public async Task<OperationResult<List<LinkedItemDto>>> GetLinksAsync(string entityType, int entityId)
    {
        if (!providersByType.TryGetValue(entityType, out var provider))
        {
            return OperationResult<List<LinkedItemDto>>.Fail($"Unknown entity type '{entityType}'.");
        }

        entityType = provider.EntityType;
        var links = await db.EntityLinks
            .Where(l => (l.SourceEntityType == entityType && l.SourceEntityId == entityId) ||
                        (l.TargetEntityType == entityType && l.TargetEntityId == entityId))
            .ToListAsync();

        // Present every link from this entity's point of view: "the other end".
        var otherEnds = links
            .Select(l => l.SourceEntityType == entityType && l.SourceEntityId == entityId
                ? (l.Id, Type: l.TargetEntityType, EntityId: l.TargetEntityId)
                : (l.Id, Type: l.SourceEntityType, EntityId: l.SourceEntityId))
            .ToList();

        var result = new List<LinkedItemDto>();
        foreach (var group in otherEnds.GroupBy(e => e.Type))
        {
            if (!providersByType.TryGetValue(group.Key, out var otherProvider))
            {
                continue;
            }

            var titles = await otherProvider.GetTitlesAsync(group.Select(e => e.EntityId).ToList());
            result.AddRange(group
                .Where(e => titles.ContainsKey(e.EntityId))
                .Select(e => new LinkedItemDto
                {
                    LinkId = e.Id,
                    EntityType = otherProvider.EntityType,
                    EntityId = e.EntityId,
                    Title = titles[e.EntityId],
                }));
        }

        return OperationResult<List<LinkedItemDto>>.Ok(result.OrderBy(r => r.EntityType).ThenBy(r => r.Title).ToList());
    }

    public async Task<OperationResult<List<LinkableItemDto>>> SearchCandidatesAsync(
        string entityType, string? search, string? excludeEntityType, int? excludeEntityId)
    {
        if (!providersByType.TryGetValue(entityType, out var provider))
        {
            return OperationResult<List<LinkableItemDto>>.Fail($"Unknown entity type '{entityType}'.");
        }

        var candidates = await provider.SearchAsync(search?.Trim(), SearchResultLimit + 1);

        if (excludeEntityType is not null && excludeEntityId is not null)
        {
            // Hide the entity itself (can't self-link). Already-linked items are filtered client-side by the
            // widget, and a duplicate create is still rejected cleanly server-side.
            candidates = candidates
                .Where(c => !(string.Equals(c.EntityType, excludeEntityType, StringComparison.OrdinalIgnoreCase) &&
                              c.EntityId == excludeEntityId))
                .ToList();
        }

        return OperationResult<List<LinkableItemDto>>.Ok(candidates.Take(SearchResultLimit).ToList());
    }

    public async Task<OperationResult<LinkedItemDto>> CreateAsync(CreateEntityLinkRequest request)
    {
        if (!providersByType.TryGetValue(request.SourceEntityType, out var sourceProvider) ||
            !providersByType.TryGetValue(request.TargetEntityType, out var targetProvider))
        {
            return OperationResult<LinkedItemDto>.Fail("Unknown entity type.");
        }

        if (sourceProvider == targetProvider && request.SourceEntityId == request.TargetEntityId)
        {
            return OperationResult<LinkedItemDto>.Fail("An item can't be linked to itself.");
        }

        // Both ends must exist and belong to the current user (providers query through the global filters).
        var sourceTitles = await sourceProvider.GetTitlesAsync([request.SourceEntityId]);
        var targetTitles = await targetProvider.GetTitlesAsync([request.TargetEntityId]);
        if (sourceTitles.Count == 0 || targetTitles.Count == 0)
        {
            return OperationResult<LinkedItemDto>.Fail("Linked item not found.");
        }

        var (sourceType, sourceId, targetType, targetId) = Canonicalize(
            sourceProvider.EntityType, request.SourceEntityId, targetProvider.EntityType, request.TargetEntityId);

        var exists = await db.EntityLinks.AnyAsync(l =>
            l.SourceEntityType == sourceType && l.SourceEntityId == sourceId &&
            l.TargetEntityType == targetType && l.TargetEntityId == targetId);
        if (exists)
        {
            return OperationResult<LinkedItemDto>.Fail(DuplicateLinkError);
        }

        var link = new EntityLink
        {
            UserId = db.CurrentUserId!.Value,
            SourceEntityType = sourceType,
            SourceEntityId = sourceId,
            TargetEntityType = targetType,
            TargetEntityId = targetId,
        };
        db.EntityLinks.Add(link);

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<LinkedItemDto>.Fail(DuplicateLinkError);
        }

        // Returned from the requester's (source's) point of view, matching what GetLinksAsync shows for it.
        return OperationResult<LinkedItemDto>.Ok(new LinkedItemDto
        {
            LinkId = link.Id,
            EntityType = targetProvider.EntityType,
            EntityId = request.TargetEntityId,
            Title = targetTitles[request.TargetEntityId],
        });
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var link = await db.EntityLinks.FindAsync(id);
        if (link is null)
        {
            return OperationResult<bool>.Fail("Link not found.");
        }

        link.IsDeleted = true;
        link.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return OperationResult<bool>.Ok(true);
    }

    public async Task RemoveAllForEntityAsync(string entityType, int entityId)
    {
        var now = DateTime.UtcNow;
        var links = await db.EntityLinks
            .Where(l => (l.SourceEntityType == entityType && l.SourceEntityId == entityId) ||
                        (l.TargetEntityType == entityType && l.TargetEntityId == entityId))
            .ToListAsync();

        foreach (var link in links)
        {
            link.IsDeleted = true;
            link.DeletedAt = now;
        }

        await db.SaveChangesAsync();
    }

    public async Task CopyLinksAsync(string fromType, int fromId, string toType, int toId)
    {
        var links = await db.EntityLinks
            .Where(l => (l.SourceEntityType == fromType && l.SourceEntityId == fromId) ||
                        (l.TargetEntityType == fromType && l.TargetEntityId == fromId))
            .ToListAsync();

        var userId = db.CurrentUserId!.Value;
        foreach (var link in links)
        {
            var (otherType, otherId) = link.SourceEntityType == fromType && link.SourceEntityId == fromId
                ? (link.TargetEntityType, link.TargetEntityId)
                : (link.SourceEntityType, link.SourceEntityId);
            if (otherType == toType && otherId == toId)
            {
                continue;
            }

            var (sourceType, sourceId, targetType, targetId) = Canonicalize(toType, toId, otherType, otherId);
            var exists = await db.EntityLinks.AnyAsync(l =>
                l.SourceEntityType == sourceType && l.SourceEntityId == sourceId &&
                l.TargetEntityType == targetType && l.TargetEntityId == targetId);
            if (!exists)
            {
                db.EntityLinks.Add(new EntityLink
                {
                    UserId = userId,
                    SourceEntityType = sourceType,
                    SourceEntityId = sourceId,
                    TargetEntityType = targetType,
                    TargetEntityId = targetId,
                });
            }
        }

        await db.SaveChangesAsync();
    }

    // Links are undirected, so each pair has exactly one stored form: the ordinally smaller (Type, Id) is Source.
    // internal (not private) for the unit tests.
    internal static (string, int, string, int) Canonicalize(string typeA, int idA, string typeB, int idB)
    {
        var comparison = string.CompareOrdinal(typeA, typeB);
        return comparison < 0 || (comparison == 0 && idA < idB)
            ? (typeA, idA, typeB, idB)
            : (typeB, idB, typeA, idA);
    }
}
