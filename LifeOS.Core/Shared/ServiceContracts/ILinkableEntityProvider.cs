using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Shared.ServiceContracts;

/// <summary>
/// Makes one entity type linkable through EntityLinks. Each module registers one provider per linkable entity
/// (Goal, Task, ...) in DI; EntityLinksService discovers them all via IEnumerable injection. Queries go through
/// AppDbContext, so the per-user + soft-delete global filters already apply.
/// </summary>
public interface ILinkableEntityProvider
{
    /// <summary>Stable identifier stored in shared.EntityLinks (e.g. "Goal"). Never rename once data exists.</summary>
    string EntityType { get; }

    string DisplayName { get; }

    /// <summary>Titles for the given ids; ids that don't exist (or belong to another user) are simply absent.</summary>
    Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids);

    Task<List<LinkableItemDto>> SearchAsync(string? search, int take);
}
