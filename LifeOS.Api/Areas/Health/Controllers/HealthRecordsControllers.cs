using LifeOS.Api.Infrastructure;
using LifeOS.Core.Health.DTOs;
using LifeOS.Core.Health.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Health.Controllers;

[ApiController]
[Area("Health")]
[Route("api/[area]/[controller]")]
[Authorize]
[VaultUnlockRequired]
public class MedicalConditionsController(IMedicalConditionsService conditionsService) : ControllerBase
{
    /// <summary>GET api/Health/MedicalConditions — conditions, surgeries and allergies; ongoing first.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll() =>
        Ok(ApiResponse<List<MedicalConditionDto>>.Ok(await conditionsService.GetAllAsync()));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id) => Found(await conditionsService.GetAsync(id));

    [HttpPost]
    public async Task<IActionResult> Create(MedicalConditionRequest request) => Result(await conditionsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, MedicalConditionRequest request) => Result(await conditionsService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await conditionsService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    private IActionResult Found(OperationResult<MedicalConditionDto> result) =>
        result.Success ? Ok(ApiResponse<MedicalConditionDto>.Ok(result.Data)) : NotFound(ApiResponse<MedicalConditionDto>.Fail(result.Error!));

    private IActionResult Result(OperationResult<MedicalConditionDto> result) =>
        result.Success ? Ok(ApiResponse<MedicalConditionDto>.Ok(result.Data)) : BadRequest(ApiResponse<MedicalConditionDto>.Fail(result.Error!));
}

[ApiController]
[Area("Health")]
[Route("api/[area]/[controller]")]
[Authorize]
[VaultUnlockRequired]
public class DoctorVisitsController(IDoctorVisitsService visitsService) : ControllerBase
{
    /// <summary>GET api/Health/DoctorVisits — newest first (the page splits upcoming from past on the client's day).</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll() =>
        Ok(ApiResponse<List<DoctorVisitDto>>.Ok(await visitsService.GetAllAsync()));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var result = await visitsService.GetAsync(id);
        return result.Success ? Ok(ApiResponse<DoctorVisitDto>.Ok(result.Data)) : NotFound(ApiResponse<DoctorVisitDto>.Fail(result.Error!));
    }

    /// <summary>POST api/Health/DoctorVisits — with times it goes on the calendar; a follow-up day sets a reminder.</summary>
    [HttpPost]
    public async Task<IActionResult> Create(DoctorVisitRequest request) => Result(await visitsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, DoctorVisitRequest request) => Result(await visitsService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await visitsService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    private IActionResult Result(OperationResult<DoctorVisitDto> result) =>
        result.Success ? Ok(ApiResponse<DoctorVisitDto>.Ok(result.Data)) : BadRequest(ApiResponse<DoctorVisitDto>.Fail(result.Error!));
}

[ApiController]
[Area("Health")]
[Route("api/[area]/[controller]")]
[Authorize]
[VaultUnlockRequired]
public class MedicationsController(IMedicationsService medicationsService) : ControllerBase
{
    /// <summary>GET api/Health/Medications?today — current first, each with its schedule and 30-day adherence.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll(DateOnly today) =>
        Ok(ApiResponse<List<MedicationDto>>.Ok(await medicationsService.GetAllAsync(today)));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id, DateOnly today)
    {
        var result = await medicationsService.GetAsync(id, today);
        return result.Success ? Ok(ApiResponse<MedicationDto>.Ok(result.Data)) : NotFound(ApiResponse<MedicationDto>.Fail(result.Error!));
    }

    [HttpPost]
    public async Task<IActionResult> Create(MedicationRequest request, DateOnly today) =>
        Result(await medicationsService.CreateAsync(request, today));

    /// <summary>PUT api/Health/Medications/{id}?today — the schedule is replaced as a whole (matched by time).</summary>
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, MedicationRequest request, DateOnly today) =>
        Result(await medicationsService.UpdateAsync(id, request, today));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await medicationsService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    /// <summary>GET api/Health/Medications/doses/{day} — the scheduled doses due that day, in time order.</summary>
    [HttpGet("doses/{day}")]
    public async Task<IActionResult> GetDoses(DateOnly day) =>
        Ok(ApiResponse<List<DoseDto>>.Ok(await medicationsService.GetDosesAsync(day)));

    /// <summary>PUT api/Health/Medications/doses/{day}/{scheduleId} { status: Taken | Skipped | null, today }.</summary>
    [HttpPut("doses/{day}/{scheduleId:int}")]
    public async Task<IActionResult> SetDose(DateOnly day, int scheduleId, DoseRequest request)
    {
        var result = await medicationsService.SetDoseAsync(scheduleId, day, request);
        return result.Success ? Ok(ApiResponse<List<DoseDto>>.Ok(result.Data)) : BadRequest(ApiResponse<List<DoseDto>>.Fail(result.Error!));
    }

    /// <summary>POST api/Health/Medications/{id}/as-needed { doseDate, today } — one dose of an as-needed medicine.</summary>
    [HttpPost("{id:int}/as-needed")]
    public async Task<IActionResult> LogAsNeeded(int id, AsNeededDoseRequest request) =>
        Result(await medicationsService.LogAsNeededAsync(id, request));

    /// <summary>DELETE api/Health/Medications/{id}/as-needed/{day}?today — takes back the latest one that day.</summary>
    [HttpDelete("{id:int}/as-needed/{day}")]
    public async Task<IActionResult> RemoveAsNeeded(int id, DateOnly day, DateOnly today) =>
        Result(await medicationsService.RemoveAsNeededAsync(id, day, today));

    private IActionResult Result(OperationResult<MedicationDto> result) =>
        result.Success ? Ok(ApiResponse<MedicationDto>.Ok(result.Data)) : BadRequest(ApiResponse<MedicationDto>.Fail(result.Error!));
}

/// <summary>
/// The one Health read without the vault unlock: how many doses are due today and how many are marked — counts
/// only, no names — so My Day can say "2 of 3 doses" and offer to unlock.
/// </summary>
[ApiController]
[Area("Health")]
[Route("api/[area]/[controller]")]
[Authorize]
public class DoseSummaryController(IMedicationsService medicationsService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(DateOnly today) =>
        Ok(ApiResponse<DoseSummaryDto>.Ok(await medicationsService.GetSummaryAsync(today)));
}

/// <summary>
/// POST api/Health/Exports — logs a CSV export of a Health list in Vault activity (the grid builds the file from rows
/// it already holds; this only needs a live unlock, so a locked export is refused with 423 and the client asks).
/// </summary>
[ApiController]
[Area("Health")]
[Route("api/[area]/[controller]")]
[Authorize]
[VaultUnlockRequired]
public class ExportsController(IVaultService vaultService) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Log(HealthExportRequest request)
    {
        if (!HealthExportLists.Words.TryGetValue(request.List, out var words))
        {
            return BadRequest(ApiResponse<bool>.Fail("That list can't be exported."));
        }

        await vaultService.LogAsync(VaultActions.Opened, null, null, $"Health › {words} exported to CSV");
        return Ok(ApiResponse<bool>.Ok(true));
    }
}
