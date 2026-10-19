using LifeOS.Core.Health.DTOs;
using LifeOS.Core.Health.Services;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Health.ServiceContracts;

/// <summary>The one health profile per user: created by the first save, rewritten in place after that.</summary>
public interface IHealthProfileService
{
    Task<HealthProfileDto> GetAsync(DateOnly today);

    Task<OperationResult<HealthProfileDto>> SaveAsync(HealthProfileRequest request);
}

/// <summary>Medical history: conditions, surgeries, allergies.</summary>
public interface IMedicalConditionsService
{
    Task<List<MedicalConditionDto>> GetAllAsync();

    Task<OperationResult<MedicalConditionDto>> GetAsync(int id);

    Task<OperationResult<MedicalConditionDto>> CreateAsync(MedicalConditionRequest request);

    Task<OperationResult<MedicalConditionDto>> UpdateAsync(int id, MedicalConditionRequest request);

    /// <summary>Visits and medicines about it stay, without it.</summary>
    Task<OperationResult<bool>> DeleteAsync(int id);
}

/// <summary>
/// Doctor visits. A visit with times owns a one-off calendar event (neutral title, Health life area); a follow-up
/// day owns one reminder (<see cref="HealthRules.FollowUpReminderDays"/> days before, 09:00 local).
/// </summary>
public interface IDoctorVisitsService
{
    Task<List<DoctorVisitDto>> GetAllAsync();

    Task<OperationResult<DoctorVisitDto>> GetAsync(int id);

    Task<OperationResult<DoctorVisitDto>> CreateAsync(DoctorVisitRequest request);

    Task<OperationResult<DoctorVisitDto>> UpdateAsync(int id, DoctorVisitRequest request);

    /// <summary>Removes its event, reminders and links; medicines and lab results from it stay, without it.</summary>
    Task<OperationResult<bool>> DeleteAsync(int id);
}

/// <summary>Medicines, their schedules and the doses marked against them.</summary>
public interface IMedicationsService
{
    Task<List<MedicationDto>> GetAllAsync(DateOnly today);

    Task<OperationResult<MedicationDto>> GetAsync(int id, DateOnly today);

    Task<OperationResult<MedicationDto>> CreateAsync(MedicationRequest request, DateOnly today);

    Task<OperationResult<MedicationDto>> UpdateAsync(int id, MedicationRequest request, DateOnly today);

    Task<OperationResult<bool>> DeleteAsync(int id);

    /// <summary>Every scheduled dose due on <paramref name="day"/>, in time order, with what was done.</summary>
    Task<List<DoseDto>> GetDosesAsync(DateOnly day);

    /// <summary>Marks (Taken/Skipped) or clears one scheduled dose; returns all of that day's doses.</summary>
    Task<OperationResult<List<DoseDto>>> SetDoseAsync(int scheduleId, DateOnly day, DoseRequest request);

    /// <summary>Logs one dose of an as-needed medicine.</summary>
    Task<OperationResult<MedicationDto>> LogAsNeededAsync(int medicationId, AsNeededDoseRequest request);

    /// <summary>Removes one logged as-needed dose (the latest on that day).</summary>
    Task<OperationResult<MedicationDto>> RemoveAsNeededAsync(int medicationId, DateOnly day, DateOnly today);

    Task<DoseSummaryDto> GetSummaryAsync(DateOnly today);
}

/// <summary>Exercise, with weekly totals.</summary>
public interface IWorkoutsService
{
    /// <summary>Workouts from..to and the <paramref name="weeks"/> ISO weeks up to today's.</summary>
    Task<FitnessDto> GetAsync(DateOnly from, DateOnly to, DateOnly today, int weeks);

    Task<OperationResult<WorkoutDto>> CreateAsync(WorkoutRequest request);

    Task<OperationResult<WorkoutDto>> UpdateAsync(int id, WorkoutRequest request);

    Task<OperationResult<bool>> DeleteAsync(int id);
}

/// <summary>Sleep, with nights and averages.</summary>
public interface ISleepService
{
    Task<SleepSummaryDto> GetAsync(DateOnly from, DateOnly to, DateOnly today);

    Task<OperationResult<SleepRecordDto>> CreateAsync(SleepRequest request);

    Task<OperationResult<SleepRecordDto>> UpdateAsync(int id, SleepRequest request);

    Task<OperationResult<bool>> DeleteAsync(int id);
}

/// <summary>Body measurements: the latest of each kind, and the history of one.</summary>
public interface IMeasurementsService
{
    Task<List<MeasurementLatestDto>> GetLatestAsync();

    /// <summary>Every measurement of a kind, oldest first.</summary>
    Task<List<MeasurementDto>> GetKindAsync(string kind);

    Task<OperationResult<MeasurementDto>> CreateAsync(MeasurementRequest request);

    Task<OperationResult<MeasurementDto>> UpdateAsync(int id, MeasurementRequest request);

    Task<OperationResult<bool>> DeleteAsync(int id);
}

/// <summary>Meals and water.</summary>
public interface INutritionService
{
    Task<NutritionDayDto> GetDayAsync(DateOnly day);

    Task<List<NutritionTrendDayDto>> GetTrendAsync(DateOnly from, DateOnly to);

    Task<OperationResult<MealDto>> CreateMealAsync(MealRequest request);

    Task<OperationResult<MealDto>> UpdateMealAsync(int id, MealRequest request);

    Task<OperationResult<bool>> DeleteMealAsync(int id);

    /// <summary>Adds a glass/bottle; returns the day.</summary>
    Task<OperationResult<NutritionDayDto>> AddWaterAsync(WaterRequest request);

    Task<OperationResult<NutritionDayDto>> RemoveWaterAsync(int id);
}
