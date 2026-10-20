using LifeOS.Core.Home.DTOs;
using LifeOS.Core.Home.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Home.Controllers;

/// <summary>Shared reply shapes for Home's controllers: a business failure is a 400, a missing item a 404.</summary>
public abstract class HomeControllerBase : ControllerBase
{
    protected IActionResult Result<T>(OperationResult<T> result) =>
        result.Success ? Ok(ApiResponse<T>.Ok(result.Data)) : BadRequest(ApiResponse<T>.Fail(result.Error!));

    protected IActionResult Found<T>(OperationResult<T> result) =>
        result.Success ? Ok(ApiResponse<T>.Ok(result.Data)) : NotFound(ApiResponse<T>.Fail(result.Error!));
}

[ApiController]
[Area("Home")]
[Route("api/[area]/[controller]")]
[Authorize]
public class PropertiesController(IPropertiesService propertiesService) : HomeControllerBase
{
    /// <summary>GET api/Home/Properties — where you live now first, then the ones you've left.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(ApiResponse<List<PropertyDto>>.Ok(await propertiesService.GetAllAsync()));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id) => Found(await propertiesService.GetAsync(id));

    [HttpPost]
    public async Task<IActionResult> Create(PropertyRequest request) => Result(await propertiesService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, PropertyRequest request) => Result(await propertiesService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) => Found(await propertiesService.DeleteAsync(id));
}

[ApiController]
[Area("Home")]
[Route("api/[area]/[controller]")]
[Authorize]
public class AssetsController(IAssetsService assetsService) : HomeControllerBase
{
    /// <summary>GET api/Home/Assets[?includeDisposed=true] — the inventory, A–Z.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] bool includeDisposed = false) =>
        Ok(ApiResponse<List<AssetDto>>.Ok(await assetsService.GetAllAsync(includeDisposed)));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id) => Found(await assetsService.GetAsync(id));

    [HttpPost]
    public async Task<IActionResult> Create(AssetRequest request) => Result(await assetsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, AssetRequest request) => Result(await assetsService.UpdateAsync(id, request));

    /// <summary>PUT api/Home/Assets/{id}/disposal — sold / donated / discarded / lost on a day (kind null: back in the inventory).</summary>
    [HttpPut("{id:int}/disposal")]
    public async Task<IActionResult> SetDisposal(int id, DisposalRequest request) => Result(await assetsService.SetDisposalAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) => Found(await assetsService.DeleteAsync(id));
}

[ApiController]
[Area("Home")]
[Route("api/[area]/[controller]")]
[Authorize]
public class VehiclesController(IVehiclesService vehiclesService) : HomeControllerBase
{
    /// <summary>GET api/Home/Vehicles — with insurance, PUC, registration, odometer and the next service.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(ApiResponse<List<VehicleDto>>.Ok(await vehiclesService.GetAllAsync()));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id) => Found(await vehiclesService.GetAsync(id));

    [HttpPost]
    public async Task<IActionResult> Create(VehicleRequest request) => Result(await vehiclesService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, VehicleRequest request) => Result(await vehiclesService.UpdateAsync(id, request));

    [HttpPut("{id:int}/disposal")]
    public async Task<IActionResult> SetDisposal(int id, DisposalRequest request) => Result(await vehiclesService.SetDisposalAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) => Found(await vehiclesService.DeleteAsync(id));
}

[ApiController]
[Area("Home")]
[Route("api/[area]/Vehicles/{vehicleId:int}/fuel")]
[Authorize]
public class FuelLogsController(IFuelLogsService fuelLogsService) : HomeControllerBase
{
    /// <summary>GET api/Home/Vehicles/{vehicleId}/fuel — fills newest first, the overall average, its trend, spend per month.</summary>
    [HttpGet]
    public async Task<IActionResult> Get(int vehicleId) => Found(await fuelLogsService.GetHistoryAsync(vehicleId));

    /// <summary>POST — a fill (the price per unit or the quantity); with an expense, one Finance expense too.</summary>
    [HttpPost]
    public async Task<IActionResult> Create(int vehicleId, FuelLogRequest request) => Result(await fuelLogsService.CreateAsync(vehicleId, request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int vehicleId, int id, FuelLogRequest request) =>
        Result(await fuelLogsService.UpdateAsync(vehicleId, id, request));

    /// <summary>PUT …/{id}/expense — record it in Finance (once).</summary>
    [HttpPut("{id:int}/expense")]
    public async Task<IActionResult> RecordExpense(int vehicleId, int id, FuelExpenseRequest request) =>
        Result(await fuelLogsService.RecordExpenseAsync(vehicleId, id, request));

    /// <summary>DELETE …/{id}/expense — take the expense back.</summary>
    [HttpDelete("{id:int}/expense")]
    public async Task<IActionResult> RemoveExpense(int vehicleId, int id) => Result(await fuelLogsService.RemoveExpenseAsync(vehicleId, id));

    /// <summary>DELETE …/{id} — the fill and the expense it created.</summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int vehicleId, int id) => Found(await fuelLogsService.DeleteAsync(vehicleId, id));
}

[ApiController]
[Area("Home")]
[Route("api/[area]/[controller]")]
[Authorize]
public class WarrantiesController(IWarrantiesService warrantiesService) : HomeControllerBase
{
    /// <summary>GET api/Home/Warranties — running out soonest first.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(ApiResponse<List<WarrantyDto>>.Ok(await warrantiesService.GetAllAsync()));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id) => Found(await warrantiesService.GetAsync(id));

    [HttpPost]
    public async Task<IActionResult> Create(WarrantyRequest request) => Result(await warrantiesService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, WarrantyRequest request) => Result(await warrantiesService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) => Found(await warrantiesService.DeleteAsync(id));
}

[ApiController]
[Area("Home")]
[Route("api/[area]/[controller]")]
[Authorize]
public class MaintenanceController(IMaintenanceService maintenanceService) : HomeControllerBase
{
    /// <summary>GET api/Home/Maintenance — due soonest first (next due computed), paused last.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(ApiResponse<List<MaintenanceTaskDto>>.Ok(await maintenanceService.GetAllAsync()));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id) => Found(await maintenanceService.GetAsync(id));

    [HttpPost]
    public async Task<IActionResult> Create(MaintenanceTaskRequest request) => Result(await maintenanceService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, MaintenanceTaskRequest request) => Result(await maintenanceService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) => Found(await maintenanceService.DeleteAsync(id));

    /// <summary>GET api/Home/Maintenance/{id}/logs — each time it was done, newest first.</summary>
    [HttpGet("{id:int}/logs")]
    public async Task<IActionResult> Logs(int id) => Found(await maintenanceService.GetLogsAsync(id));

    /// <summary>POST api/Home/Maintenance/{id}/done — log it done; the next due day moves on.</summary>
    [HttpPost("{id:int}/done")]
    public async Task<IActionResult> Done(int id, MaintenanceDoneRequest request) => Result(await maintenanceService.DoneAsync(id, request));

    /// <summary>DELETE api/Home/Maintenance/{id}/logs/{logId}?timeZone= — take a log back.</summary>
    [HttpDelete("{id:int}/logs/{logId:int}")]
    public async Task<IActionResult> RemoveLog(int id, int logId, [FromQuery] string? timeZone) =>
        Result(await maintenanceService.RemoveLogAsync(id, logId, timeZone));
}

[ApiController]
[Area("Home")]
[Route("api/[area]/[controller]")]
[Authorize]
public class AgendaController(IHomeAgendaService agendaService) : HomeControllerBase
{
    /// <summary>GET api/Home/Agenda?today=2026-10-20 — what needs attention at home soon, soonest first.</summary>
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] DateOnly? today) =>
        today is { } day
            ? Ok(ApiResponse<List<HomeAgendaItemDto>>.Ok(await agendaService.UpcomingAsync(day)))
            : BadRequest(ApiResponse<List<HomeAgendaItemDto>>.Fail("Today's date is required."));
}

[ApiController]
[Area("Home")]
[Route("api/[area]/[controller]")]
[Authorize]
public class UtilityBillsController(IUtilityBillsService billsService) : HomeControllerBase
{
    /// <summary>GET api/Home/UtilityBills — unpaid first (due soonest), then paid, latest first.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(ApiResponse<List<UtilityBillDto>>.Ok(await billsService.GetAllAsync()));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id) => Found(await billsService.GetAsync(id));

    [HttpPost]
    public async Task<IActionResult> Create(UtilityBillRequest request) => Result(await billsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, UtilityBillRequest request) => Result(await billsService.UpdateAsync(id, request));

    /// <summary>PUT api/Home/UtilityBills/{id}/paid — paid on a day; with an account, one Finance expense.</summary>
    [HttpPut("{id:int}/paid")]
    public async Task<IActionResult> Pay(int id, BillPaidRequest request) => Result(await billsService.PayAsync(id, request));

    /// <summary>DELETE api/Home/UtilityBills/{id}/paid — take the payment (and its expense) back.</summary>
    [HttpDelete("{id:int}/paid")]
    public async Task<IActionResult> Unpay(int id) => Result(await billsService.UnpayAsync(id));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) => Found(await billsService.DeleteAsync(id));
}

[ApiController]
[Area("Home")]
[Route("api/[area]/[controller]")]
[Authorize]
public class HouseholdProjectsController(IHouseholdProjectsService projectsService) : HomeControllerBase
{
    /// <summary>GET api/Home/HouseholdProjects — with tasks done/open and spend from linked expenses.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(ApiResponse<List<HouseholdProjectDto>>.Ok(await projectsService.GetAllAsync()));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id) => Found(await projectsService.GetAsync(id));

    [HttpPost]
    public async Task<IActionResult> Create(HouseholdProjectRequest request) => Result(await projectsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, HouseholdProjectRequest request) => Result(await projectsService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) => Found(await projectsService.DeleteAsync(id));
}
