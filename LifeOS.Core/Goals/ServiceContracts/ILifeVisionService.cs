using LifeOS.Core.Goals.DTOs;

namespace LifeOS.Core.Goals.ServiceContracts;

public interface ILifeVisionService
{
    Task<LifeVisionDto> GetAsync();

    /// <summary>Rewrites the vision; blank clears it.</summary>
    Task<LifeVisionDto> SaveAsync(LifeVisionRequest request);
}
