using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Shared.ServiceContracts;

public interface IEntityLinksService
{
    List<LinkableTypeDto> GetLinkableTypes();
    Task<OperationResult<List<LinkedItemDto>>> GetLinksAsync(string entityType, int entityId);
    Task<OperationResult<List<LinkableItemDto>>> SearchCandidatesAsync(string entityType, string? search, string? excludeEntityType, int? excludeEntityId);
    Task<OperationResult<LinkedItemDto>> CreateAsync(CreateEntityLinkRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);

    /// <summary>Soft-deletes every link touching an entity; call from a module's own delete so no dangling links remain.</summary>
    Task RemoveAllForEntityAsync(string entityType, int entityId);

    /// <summary>
    /// Gives entity "to" every link entity "from" has (skipping ones it already has). Used when one entity turns
    /// into another, e.g. an Inbox item processed into a real task keeps what it was linked to.
    /// </summary>
    Task CopyLinksAsync(string fromType, int fromId, string toType, int toId);
}
