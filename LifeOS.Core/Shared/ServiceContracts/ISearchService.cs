using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Shared.ServiceContracts;

/// <summary>Global search: one query across every linkable kind of item the user owns.</summary>
public interface ISearchService
{
    /// <summary>Groups with at least one match, in a fixed order; empty for a query under two characters.</summary>
    Task<OperationResult<List<SearchGroupDto>>> SearchAsync(string? query);
}
