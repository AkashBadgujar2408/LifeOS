using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Shared.ServiceContracts;

public interface ILifeAreasService
{
    Task<List<LifeAreaDto>> GetAllAsync();
}
