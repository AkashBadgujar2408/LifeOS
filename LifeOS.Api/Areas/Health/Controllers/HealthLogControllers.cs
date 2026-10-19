using LifeOS.Api.Infrastructure;
using LifeOS.Core.Health.DTOs;
using LifeOS.Core.Health.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Health.Controllers;

/// <summary>Shared shape of the Health log controllers: 200 with the data, 400 with the reason, 404 when missing.</summary>
public abstract class HealthLogController : ControllerBase
{
    protected IActionResult Result<T>(OperationResult<T> result) =>
        result.Success ? Ok(ApiResponse<T>.Ok(result.Data)) : BadRequest(ApiResponse<T>.Fail(result.Error!));

    protected IActionResult Deleted(OperationResult<bool> result) =>
        result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
}

[ApiController]
[Area("Health")]
[Route("api/[area]/[controller]")]
[Authorize]
[VaultUnlockRequired]
public class WorkoutsController(IWorkoutsService workoutsService) : HealthLogController
{
    /// <summary>GET api/Health/Workouts?from&amp;to&amp;today&amp;weeks=12 — the range's workouts + weekly totals.</summary>
    [HttpGet]
    public async Task<IActionResult> Get(DateOnly from, DateOnly to, DateOnly today, int weeks = 12) =>
        Ok(ApiResponse<FitnessDto>.Ok(await workoutsService.GetAsync(from, to, today, weeks)));

    [HttpPost]
    public async Task<IActionResult> Create(WorkoutRequest request) => Result(await workoutsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, WorkoutRequest request) => Result(await workoutsService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) => Deleted(await workoutsService.DeleteAsync(id));
}

[ApiController]
[Area("Health")]
[Route("api/[area]/[controller]")]
[Authorize]
[VaultUnlockRequired]
public class SleepController(ISleepService sleepService) : HealthLogController
{
    /// <summary>GET api/Health/Sleep?from&amp;to&amp;today — records, nights and 7/30-day averages.</summary>
    [HttpGet]
    public async Task<IActionResult> Get(DateOnly from, DateOnly to, DateOnly today) =>
        Ok(ApiResponse<SleepSummaryDto>.Ok(await sleepService.GetAsync(from, to, today)));

    [HttpPost]
    public async Task<IActionResult> Create(SleepRequest request) => Result(await sleepService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, SleepRequest request) => Result(await sleepService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) => Deleted(await sleepService.DeleteAsync(id));
}

[ApiController]
[Area("Health")]
[Route("api/[area]/[controller]")]
[Authorize]
[VaultUnlockRequired]
public class MeasurementsController(IMeasurementsService measurementsService) : HealthLogController
{
    /// <summary>GET api/Health/Measurements/latest — the latest of each kind, with the change since the one before.</summary>
    [HttpGet("latest")]
    public async Task<IActionResult> Latest() =>
        Ok(ApiResponse<List<MeasurementLatestDto>>.Ok(await measurementsService.GetLatestAsync()));

    /// <summary>GET api/Health/Measurements?kind=Weight — the whole history of one kind, oldest first.</summary>
    [HttpGet]
    public async Task<IActionResult> Get(string kind) =>
        Ok(ApiResponse<List<MeasurementDto>>.Ok(await measurementsService.GetKindAsync(kind)));

    [HttpPost]
    public async Task<IActionResult> Create(MeasurementRequest request) => Result(await measurementsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, MeasurementRequest request) =>
        Result(await measurementsService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) => Deleted(await measurementsService.DeleteAsync(id));
}

[ApiController]
[Area("Health")]
[Route("api/[area]/[controller]")]
[Authorize]
[VaultUnlockRequired]
public class NutritionController(INutritionService nutritionService) : HealthLogController
{
    /// <summary>GET api/Health/Nutrition/day/{day} — the day's meals and water with totals.</summary>
    [HttpGet("day/{day}")]
    public async Task<IActionResult> Day(DateOnly day) =>
        Ok(ApiResponse<NutritionDayDto>.Ok(await nutritionService.GetDayAsync(day)));

    /// <summary>GET api/Health/Nutrition?from&amp;to — calories and water per day (up to 400 days).</summary>
    [HttpGet]
    public async Task<IActionResult> Trend(DateOnly from, DateOnly to) =>
        Ok(ApiResponse<List<NutritionTrendDayDto>>.Ok(await nutritionService.GetTrendAsync(from, to)));

    [HttpPost("meals")]
    public async Task<IActionResult> CreateMeal(MealRequest request) => Result(await nutritionService.CreateMealAsync(request));

    [HttpPut("meals/{id:int}")]
    public async Task<IActionResult> UpdateMeal(int id, MealRequest request) => Result(await nutritionService.UpdateMealAsync(id, request));

    [HttpDelete("meals/{id:int}")]
    public async Task<IActionResult> DeleteMeal(int id) => Deleted(await nutritionService.DeleteMealAsync(id));

    /// <summary>POST api/Health/Nutrition/water { drunkOn, millilitres, today } — returns the day.</summary>
    [HttpPost("water")]
    public async Task<IActionResult> AddWater(WaterRequest request) => Result(await nutritionService.AddWaterAsync(request));

    [HttpDelete("water/{id:int}")]
    public async Task<IActionResult> RemoveWater(int id) => Result(await nutritionService.RemoveWaterAsync(id));
}

[ApiController]
[Area("Health")]
[Route("api/[area]/[controller]")]
[Authorize]
[VaultUnlockRequired]
public class LabResultsController(ILabResultsService labResultsService) : HealthLogController
{
    /// <summary>GET api/Health/LabResults — every test with its history (newest first), out of range first.</summary>
    [HttpGet]
    public async Task<IActionResult> GetTests() =>
        Ok(ApiResponse<List<LabTestDto>>.Ok(await labResultsService.GetTestsAsync()));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var result = await labResultsService.GetAsync(id);
        return result.Success ? Ok(ApiResponse<LabResultDto>.Ok(result.Data)) : NotFound(ApiResponse<LabResultDto>.Fail(result.Error!));
    }

    [HttpPost]
    public async Task<IActionResult> Create(LabResultRequest request) => Result(await labResultsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, LabResultRequest request) => Result(await labResultsService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) => Deleted(await labResultsService.DeleteAsync(id));
}

[ApiController]
[Area("Health")]
[Route("api/[area]/[controller]")]
[Authorize]
[VaultUnlockRequired]
public class WellnessController(IWellnessService wellnessService) : HealthLogController
{
    /// <summary>GET api/Health/Wellness?from&amp;to&amp;today — mood (journal), stress and energy per day, with averages.</summary>
    [HttpGet]
    public async Task<IActionResult> Get(DateOnly from, DateOnly to, DateOnly today) =>
        Ok(ApiResponse<WellnessDto>.Ok(await wellnessService.GetAsync(from, to, today)));

    /// <summary>PUT api/Health/Wellness/{day} — the day's check-in, rewritten; all blank removes it (data: null).</summary>
    [HttpPut("{day}")]
    public async Task<IActionResult> Save(DateOnly day, WellnessCheckInRequest request) => Result(await wellnessService.SaveAsync(day, request));
}

[ApiController]
[Area("Health")]
[Route("api/[area]/[controller]")]
[Authorize]
[VaultUnlockRequired]
public class GoalTargetsController(IGoalTargetsService goalTargetsService) : HealthLogController
{
    /// <summary>GET api/Health/GoalTargets — every goal with a health target and how far along it is.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll() =>
        Ok(ApiResponse<List<GoalTargetDto>>.Ok(await goalTargetsService.GetAllAsync()));

    /// <summary>GET api/Health/GoalTargets/{goalId} — data: null when the goal has none.</summary>
    [HttpGet("{goalId:int}")]
    public async Task<IActionResult> Get(int goalId)
    {
        var result = await goalTargetsService.GetAsync(goalId);
        return result.Success ? Ok(ApiResponse<GoalTargetDto?>.Ok(result.Data)) : NotFound(ApiResponse<GoalTargetDto?>.Fail(result.Error!));
    }

    [HttpPut("{goalId:int}")]
    public async Task<IActionResult> Save(int goalId, GoalTargetRequest request) => Result(await goalTargetsService.SaveAsync(goalId, request));

    [HttpDelete("{goalId:int}")]
    public async Task<IActionResult> Delete(int goalId) => Deleted(await goalTargetsService.DeleteAsync(goalId));
}
