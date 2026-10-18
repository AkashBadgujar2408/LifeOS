using LifeOS.Core.Dashboard.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Dashboard.ServiceContracts;

public interface IKpisService
{
    /// <summary>
    /// The user's KPI tiles as of their local <paramref name="today"/>; <paramref name="timeZoneId"/> (IANA, from the
    /// browser) places the windows' local midnights in UTC for moments such as CompletedAt.
    /// </summary>
    Task<OperationResult<KpisDto>> GetAsync(DateOnly today, string? timeZoneId);

    /// <summary>Replaces the chosen tiles (order kept); returns the keys now chosen.</summary>
    Task<OperationResult<List<string>>> SaveAsync(SaveKpisRequest request);
}
