using LifeOS.Core.Health.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Health.ServiceContracts;

/// <summary>The one health profile per user: created by the first save, rewritten in place after that.</summary>
public interface IHealthProfileService
{
    Task<HealthProfileDto> GetAsync(DateOnly today);

    Task<OperationResult<HealthProfileDto>> SaveAsync(HealthProfileRequest request);
}
