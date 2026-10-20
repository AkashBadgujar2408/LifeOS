using LifeOS.Core.Home.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Home.ServiceContracts;

public interface IPropertiesService
{
    Task<List<PropertyDto>> GetAllAsync();
    Task<OperationResult<PropertyDto>> GetAsync(int id);
    Task<OperationResult<PropertyDto>> CreateAsync(PropertyRequest request);
    Task<OperationResult<PropertyDto>> UpdateAsync(int id, PropertyRequest request);

    /// <summary>Its inventory, bills and maintenance stay (no longer tied to it); warranties on the property itself go.</summary>
    Task<OperationResult<bool>> DeleteAsync(int id);
}

public interface IAssetsService
{
    /// <summary>The inventory; disposed things only when asked for.</summary>
    Task<List<AssetDto>> GetAllAsync(bool includeDisposed);
    Task<OperationResult<AssetDto>> GetAsync(int id);
    Task<OperationResult<AssetDto>> CreateAsync(AssetRequest request);
    Task<OperationResult<AssetDto>> UpdateAsync(int id, AssetRequest request);
    Task<OperationResult<AssetDto>> SetDisposalAsync(int id, DisposalRequest request);

    /// <summary>Takes its warranties (and their reminders) with it; its maintenance stays, no longer tied to it.</summary>
    Task<OperationResult<bool>> DeleteAsync(int id);
}

public interface IVehiclesService
{
    Task<List<VehicleDto>> GetAllAsync();
    Task<OperationResult<VehicleDto>> GetAsync(int id);
    Task<OperationResult<VehicleDto>> CreateAsync(VehicleRequest request);
    Task<OperationResult<VehicleDto>> UpdateAsync(int id, VehicleRequest request);
    Task<OperationResult<VehicleDto>> SetDisposalAsync(int id, DisposalRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
}

public interface IWarrantiesService
{
    Task<List<WarrantyDto>> GetAllAsync();
    Task<OperationResult<WarrantyDto>> GetAsync(int id);
    Task<OperationResult<WarrantyDto>> CreateAsync(WarrantyRequest request);
    Task<OperationResult<WarrantyDto>> UpdateAsync(int id, WarrantyRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);

    /// <summary>Soft-deletes the given warranties with their links and reminders (an asset/vehicle/property going).</summary>
    Task RemoveAsync(IReadOnlyCollection<int> ids);
}

public interface IMaintenanceService
{
    Task<List<MaintenanceTaskDto>> GetAllAsync();
    Task<OperationResult<MaintenanceTaskDto>> GetAsync(int id);
    Task<OperationResult<MaintenanceTaskDto>> CreateAsync(MaintenanceTaskRequest request);
    Task<OperationResult<MaintenanceTaskDto>> UpdateAsync(int id, MaintenanceTaskRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
    Task<OperationResult<List<MaintenanceLogDto>>> GetLogsAsync(int id);

    /// <summary>Logs it as done; the next due day (and its reminder) move on.</summary>
    Task<OperationResult<MaintenanceTaskDto>> DoneAsync(int id, MaintenanceDoneRequest request);

    /// <summary>Takes a log back (logged by mistake); the next due day moves back.</summary>
    Task<OperationResult<MaintenanceTaskDto>> RemoveLogAsync(int id, int logId, string? timeZone);
}

public interface IHomeAgendaService
{
    /// <summary>Warranties / PUC / registrations running out (60 days ahead to 30 days gone) and maintenance due within 14 days or overdue, soonest first.</summary>
    Task<List<HomeAgendaItemDto>> UpcomingAsync(DateOnly today);
}
