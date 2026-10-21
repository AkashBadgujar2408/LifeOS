using System.ComponentModel.DataAnnotations;

namespace LifeOS.Core.Health.DTOs;

/// <summary>The fixed kinds of the health schema — each matches a CHECK in 13_health.sql. Never rename one once stored.</summary>
public static class HealthKinds
{
    public static readonly IReadOnlySet<string> Sexes = new HashSet<string>(["Female", "Male", "Intersex"], StringComparer.Ordinal);

    public static readonly IReadOnlySet<string> BloodGroups =
        new HashSet<string>(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"], StringComparer.Ordinal);

    public static readonly IReadOnlySet<string> ConditionKinds = new HashSet<string>(["Condition", "Surgery", "Allergy"], StringComparer.Ordinal);
    public static readonly IReadOnlySet<string> Severities = new HashSet<string>(["Mild", "Moderate", "Severe"], StringComparer.Ordinal);
    public static readonly IReadOnlySet<string> DoseStatuses = new HashSet<string>(["Taken", "Skipped"], StringComparer.Ordinal);

    public static readonly IReadOnlySet<string> WorkoutKinds =
        new HashSet<string>(["Walk", "Run", "Cycle", "Swim", "Strength", "Yoga", "Sport", "Other"], StringComparer.Ordinal);

    public static readonly IReadOnlySet<string> Intensities = new HashSet<string>(["Light", "Moderate", "Hard"], StringComparer.Ordinal);
    public static readonly IReadOnlySet<string> MealTypes = new HashSet<string>(["Breakfast", "Lunch", "Dinner", "Snack"], StringComparer.Ordinal);

    /// <summary>Each measurement kind with the one unit it's stored in.</summary>
    public static readonly IReadOnlyDictionary<string, string> MeasurementUnits = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["Weight"] = "kg", ["BodyFat"] = "%", ["Waist"] = "cm", ["Chest"] = "cm", ["Hips"] = "cm",
        ["BloodPressure"] = "mmHg", ["RestingHeartRate"] = "bpm", ["BloodSugar"] = "mg/dL",
    };
}

/// <summary>The longest note kept (plain text, before encryption; the column itself is NVARCHAR(MAX)).</summary>
public static class HealthLimits
{
    public const int NotesLength = 4000;
}

public class HealthProfileDto
{
    public DateOnly? DateOfBirth { get; init; }
    public string? Sex { get; init; }
    public string? BloodGroup { get; init; }
    public decimal? HeightCm { get; init; }
    public bool? IsOrganDonor { get; init; }
    public string? Notes { get; init; }
    /// <summary>Whole years on the client's today (null without a date of birth).</summary>
    public int? Age { get; set; }
    /// <summary>Null until something was saved: the page shows an empty form then.</summary>
    public DateTime? UpdatedAt { get; init; }
}

public class HealthProfileRequest
{
    public DateOnly? DateOfBirth { get; init; }
    public string? Sex { get; init; }
    public string? BloodGroup { get; init; }
    public decimal? HeightCm { get; init; }
    public bool? IsOrganDonor { get; init; }

    [StringLength(HealthLimits.NotesLength)]
    public string? Notes { get; init; }

    /// <summary>The client's local day (a date of birth can't be after it).</summary>
    public DateOnly Today { get; init; }
}

// ---- Medical history ----

public class MedicalConditionDto
{
    public int Id { get; init; }
    public string Kind { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string? Severity { get; init; }
    public DateOnly? StartedOn { get; init; }
    public DateOnly? EndedOn { get; init; }
    public string? Notes { get; init; }
}

public class MedicalConditionRequest
{
    [Required]
    public string Kind { get; init; } = string.Empty;

    [Required]
    [StringLength(200)]
    public string Name { get; init; } = string.Empty;

    public string? Severity { get; init; }
    public DateOnly? StartedOn { get; init; }
    public DateOnly? EndedOn { get; init; }

    [StringLength(HealthLimits.NotesLength)]
    public string? Notes { get; init; }

    public DateOnly Today { get; init; }
}

// ---- Doctor visits ----

public class DoctorVisitDto
{
    public int Id { get; init; }
    public string Reason { get; init; } = string.Empty;
    public DateOnly VisitOn { get; init; }
    public int? ContactId { get; init; }
    public string? ContactName { get; init; }
    public string? Specialty { get; init; }
    public string? Place { get; init; }
    public int? ConditionId { get; init; }
    public string? ConditionName { get; init; }
    /// <summary>The appointment, when it has a time (its calendar event's).</summary>
    public DateTime? StartsAt { get; init; }
    public DateTime? EndsAt { get; init; }
    public int? EventId { get; init; }
    public DateOnly? FollowUpOn { get; init; }
    public string? Notes { get; init; }
    /// <summary>Medicines prescribed at this visit.</summary>
    public List<string> Prescribed { get; init; } = [];
}

public class DoctorVisitRequest
{
    [Required]
    [StringLength(200)]
    public string Reason { get; init; } = string.Empty;

    public DateOnly VisitOn { get; init; }
    public int? ContactId { get; init; }

    [StringLength(100)]
    public string? Specialty { get; init; }

    [StringLength(200)]
    public string? Place { get; init; }

    public int? ConditionId { get; init; }

    /// <summary>Both or neither, with a timezone: the appointment on the calendar.</summary>
    public DateTime? StartsAt { get; init; }
    public DateTime? EndsAt { get; init; }

    public DateOnly? FollowUpOn { get; init; }

    [StringLength(HealthLimits.NotesLength)]
    public string? Notes { get; init; }

    /// <summary>The browser's zone, used for the follow-up reminder when Settings has none.</summary>
    public string? TimeZone { get; init; }
}

// ---- Medications ----

public class MedicationScheduleDto
{
    public int Id { get; init; }
    /// <summary>"08:00", local wall-clock time.</summary>
    public string TimeOfDay { get; init; } = string.Empty;
    public byte ScheduleDays { get; init; }
    public string? Dose { get; init; }
}

public class MedicationScheduleRequest
{
    [Required]
    public string TimeOfDay { get; init; } = string.Empty;

    public byte ScheduleDays { get; init; } = 127;

    [StringLength(100)]
    public string? Dose { get; init; }
}

public class MedicationDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Strength { get; init; }
    public DateOnly StartDate { get; init; }
    public DateOnly? EndDate { get; init; }
    public bool IsAsNeeded { get; init; }
    public int? ConditionId { get; init; }
    public string? ConditionName { get; init; }
    public int? PrescribedAtVisitId { get; init; }
    public string? Notes { get; init; }
    public List<MedicationScheduleDto> Schedules { get; init; } = [];
    /// <summary>Taken on time over the last 30 days, % (null: nothing was due).</summary>
    public int? Adherence { get; set; }
    /// <summary>As-needed doses taken in the last 30 days.</summary>
    public int TakenLast30Days { get; set; }
    /// <summary>The local day of the last as-needed dose.</summary>
    public DateOnly? LastTakenOn { get; set; }
}

public class MedicationRequest
{
    [Required]
    [StringLength(200)]
    public string Name { get; init; } = string.Empty;

    [StringLength(100)]
    public string? Strength { get; init; }

    public DateOnly StartDate { get; init; }
    public DateOnly? EndDate { get; init; }
    public bool IsAsNeeded { get; init; }
    public int? ConditionId { get; init; }
    public int? PrescribedAtVisitId { get; init; }

    [StringLength(HealthLimits.NotesLength)]
    public string? Notes { get; init; }

    /// <summary>Replaced as a whole; matched to the saved ones by time, so a kept time keeps its doses.</summary>
    public List<MedicationScheduleRequest> Schedules { get; init; } = [];
}

/// <summary>One scheduled dose on a day, with what was done about it.</summary>
public class DoseDto
{
    public int MedicationId { get; init; }
    public string MedicationName { get; init; } = string.Empty;
    public string? Strength { get; init; }
    public int ScheduleId { get; init; }
    public string TimeOfDay { get; init; } = string.Empty;
    public string? Dose { get; init; }
    /// <summary>Taken, Skipped, or null while still to do.</summary>
    public string? Status { get; init; }
    public DateTime? TakenAt { get; init; }
}

public class DoseRequest
{
    /// <summary>Taken, Skipped, or null to clear it.</summary>
    public string? Status { get; init; }

    public DateOnly Today { get; init; }
}

public class AsNeededDoseRequest
{
    public DateOnly DoseDate { get; init; }
    public DateOnly Today { get; init; }
}

/// <summary>Counts only — what My Day may show without the unlock.</summary>
public class DoseSummaryDto
{
    public int Due { get; init; }
    public int Done { get; init; }
}

// ---- Fitness ----

public class WorkoutDto
{
    public int Id { get; init; }
    public string Kind { get; init; } = string.Empty;
    public DateOnly OccurredOn { get; init; }
    public int Minutes { get; init; }
    public int? Steps { get; init; }
    public decimal? DistanceKm { get; init; }
    public int? Calories { get; init; }
    public string? Intensity { get; init; }
    public string? Notes { get; init; }
}

public class WorkoutRequest
{
    [Required]
    public string Kind { get; init; } = string.Empty;

    public DateOnly OccurredOn { get; init; }
    public int Minutes { get; init; }
    public int? Steps { get; init; }
    public decimal? DistanceKm { get; init; }
    public int? Calories { get; init; }
    public string? Intensity { get; init; }

    [StringLength(HealthLimits.NotesLength)]
    public string? Notes { get; init; }

    public DateOnly Today { get; init; }
}

/// <summary>One ISO week (Monday first) of exercise.</summary>
public class WorkoutWeekDto
{
    public DateOnly WeekStart { get; init; }
    public int Minutes { get; init; }
    public int Sessions { get; init; }
    public int Steps { get; init; }
}

public class FitnessDto
{
    /// <summary>The workouts in the asked range, newest first.</summary>
    public List<WorkoutDto> Workouts { get; init; } = [];
    /// <summary>The last weeks up to this one, oldest first, empty weeks included.</summary>
    public List<WorkoutWeekDto> Weeks { get; init; } = [];
}

// ---- Sleep ----

public class SleepRecordDto
{
    public int Id { get; init; }
    public DateOnly WokeOn { get; init; }
    public DateTime StartedAt { get; init; }
    public DateTime EndedAt { get; init; }
    public int Minutes { get; init; }
    public byte? Quality { get; init; }
    public bool IsNap { get; init; }
    public string? Notes { get; init; }
}

public class SleepRequest
{
    /// <summary>The local day it counts for — the morning it ended.</summary>
    public DateOnly WokeOn { get; init; }
    public DateTime StartedAt { get; init; }
    public DateTime EndedAt { get; init; }
    public byte? Quality { get; init; }
    public bool IsNap { get; init; }

    [StringLength(HealthLimits.NotesLength)]
    public string? Notes { get; init; }

    public DateOnly Today { get; init; }
}

/// <summary>A night's sleep (naps left out), for the chart.</summary>
public class SleepNightDto
{
    public DateOnly WokeOn { get; init; }
    public int Minutes { get; init; }
    public byte? Quality { get; init; }
}

public class SleepSummaryDto
{
    /// <summary>Every record in the range (naps too), newest first.</summary>
    public List<SleepRecordDto> Records { get; init; } = [];
    /// <summary>Each night in the range with sleep logged, oldest first.</summary>
    public List<SleepNightDto> Nights { get; init; } = [];
    /// <summary>Average per night logged in the last 7 / 30 days (null: none logged).</summary>
    public int? Average7Minutes { get; init; }
    public int? Average30Minutes { get; init; }
    public decimal? AverageQuality30 { get; init; }
    public int NightsLogged30 { get; init; }
}

// ---- Body measurements ----

public class MeasurementDto
{
    public int Id { get; init; }
    public string Kind { get; init; } = string.Empty;
    public DateOnly MeasuredOn { get; init; }
    public decimal Value { get; init; }
    public decimal? Value2 { get; init; }
    public string? Notes { get; init; }
}

public class MeasurementRequest
{
    [Required]
    public string Kind { get; init; } = string.Empty;

    public DateOnly MeasuredOn { get; init; }
    public decimal Value { get; init; }
    public decimal? Value2 { get; init; }

    [StringLength(HealthLimits.NotesLength)]
    public string? Notes { get; init; }

    public DateOnly Today { get; init; }
}

/// <summary>The latest of one kind and how it moved since the one before.</summary>
public class MeasurementLatestDto
{
    public string Kind { get; init; } = string.Empty;
    public string Unit { get; init; } = string.Empty;
    public MeasurementDto Latest { get; init; } = new();
    public decimal? Change { get; init; }
    public DateOnly? PreviousOn { get; init; }
    public int Count { get; init; }
}

// ---- Nutrition ----

public class MealDto
{
    public int Id { get; init; }
    public DateOnly EatenOn { get; init; }
    public string MealType { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public int? Calories { get; init; }
    public decimal? ProteinG { get; init; }
    public decimal? CarbsG { get; init; }
    public decimal? FatG { get; init; }
    public string? Notes { get; init; }
}

public class MealRequest
{
    public DateOnly EatenOn { get; init; }

    [Required]
    public string MealType { get; init; } = string.Empty;

    [Required]
    [StringLength(500)]
    public string Description { get; init; } = string.Empty;

    public int? Calories { get; init; }
    public decimal? ProteinG { get; init; }
    public decimal? CarbsG { get; init; }
    public decimal? FatG { get; init; }

    [StringLength(HealthLimits.NotesLength)]
    public string? Notes { get; init; }

    public DateOnly Today { get; init; }
}

public class WaterRequest
{
    public DateOnly DrunkOn { get; init; }
    public int Millilitres { get; init; }
    public DateOnly Today { get; init; }
}

public class WaterDto
{
    public int Id { get; init; }
    public int Millilitres { get; init; }
    public DateTime CreatedAt { get; init; }
}

/// <summary>A day's food and water, with totals (a total only counts the meals that gave the figure).</summary>
public class NutritionDayDto
{
    public DateOnly Day { get; init; }
    public List<MealDto> Meals { get; init; } = [];
    public List<WaterDto> Water { get; init; } = [];
    public int WaterMl { get; init; }
    public int? Calories { get; init; }
    public decimal? ProteinG { get; init; }
}

public class NutritionTrendDayDto
{
    public DateOnly Day { get; init; }
    public int? Calories { get; init; }
    public int WaterMl { get; init; }
    public int Meals { get; init; }
}

// ---- Lab results ----

/// <summary>Where a result sits against the lab's range. Null when it can't be said (a word result, no range).</summary>
public static class LabFlags
{
    public const string Low = "Low";
    public const string Normal = "Normal";
    public const string High = "High";
}

public class LabResultDto
{
    public int Id { get; init; }
    public string TestName { get; init; } = string.Empty;
    public DateOnly TakenOn { get; init; }
    public decimal? Value { get; init; }
    public string? ValueText { get; init; }
    public string? Unit { get; init; }
    public decimal? RangeLow { get; init; }
    public decimal? RangeHigh { get; init; }
    public string? Laboratory { get; init; }
    public int? VisitId { get; init; }
    public string? Notes { get; init; }
    public string? Flag { get; init; }
}

public class LabResultRequest
{
    [Required]
    [StringLength(200)]
    public string TestName { get; init; } = string.Empty;

    public DateOnly TakenOn { get; init; }
    public decimal? Value { get; init; }

    [StringLength(100)]
    public string? ValueText { get; init; }

    [StringLength(30)]
    public string? Unit { get; init; }

    public decimal? RangeLow { get; init; }
    public decimal? RangeHigh { get; init; }

    [StringLength(200)]
    public string? Laboratory { get; init; }

    public int? VisitId { get; init; }

    [StringLength(HealthLimits.NotesLength)]
    public string? Notes { get; init; }

    public DateOnly Today { get; init; }
}

/// <summary>One test's history (same name, any case), newest result first.</summary>
public class LabTestDto
{
    public string TestName { get; init; } = string.Empty;
    public string? Unit { get; init; }
    public List<LabResultDto> Results { get; init; } = [];
    /// <summary>The latest result is outside its range.</summary>
    public bool LatestOutOfRange { get; init; }
}

// ---- Mental wellness ----

public class WellnessCheckInDto
{
    public DateOnly Day { get; init; }
    public byte? StressLevel { get; init; }
    public byte? EnergyLevel { get; init; }
    public string? Notes { get; init; }
}

public class WellnessCheckInRequest
{
    public byte? StressLevel { get; init; }
    public byte? EnergyLevel { get; init; }

    [StringLength(HealthLimits.NotesLength)]
    public string? Notes { get; init; }

    public DateOnly Today { get; init; }
}

public class WellnessDayDto
{
    public DateOnly Day { get; init; }
    /// <summary>The journal entry's mood that day (1–5), if any.</summary>
    public byte? Mood { get; init; }
    public byte? StressLevel { get; init; }
    public byte? EnergyLevel { get; init; }
}

public class WellnessDto
{
    /// <summary>Every day from..to, oldest first.</summary>
    public List<WellnessDayDto> Days { get; init; } = [];
    public WellnessCheckInDto? Today { get; init; }
    public decimal? AverageMood { get; init; }
    public decimal? AverageStress { get; init; }
    public decimal? AverageEnergy { get; init; }
}

// ---- Health goals ----

/// <summary>A goal measured by the body: from where it started to the target, with the latest reading.</summary>
public class GoalTargetDto
{
    public int GoalId { get; init; }
    public string GoalTitle { get; init; } = string.Empty;
    public string Kind { get; init; } = string.Empty;
    public string Unit { get; init; } = string.Empty;
    public decimal StartValue { get; init; }
    public decimal TargetValue { get; init; }
    public decimal? LatestValue { get; init; }
    public DateOnly? LatestOn { get; init; }
    /// <summary>Of the way from start to target, 0–100 (overshooting counts as 100).</summary>
    public int Percent { get; init; }
}

public class GoalTargetRequest
{
    [Required]
    public string Kind { get; init; } = string.Empty;

    /// <summary>Blank = the latest measurement of that kind.</summary>
    public decimal? StartValue { get; init; }

    public decimal TargetValue { get; init; }
}

/// <summary>
/// The Health lists a CSV can be exported from (Session 75a), each with the words logged in Vault activity — a fixed
/// set, so nothing typed by a client ends up in the log.
/// </summary>
public static class HealthExportLists
{
    public static readonly IReadOnlyDictionary<string, string> Words = new Dictionary<string, string>
    {
        ["workouts"] = "Exercise",
        ["sleep"] = "Sleep",
        ["measurements"] = "Body measurements",
        ["lab-results"] = "Lab results",
    };
}

/// <summary>POST api/Health/Exports — <c>List</c> is one of <see cref="HealthExportLists"/>.</summary>
public class HealthExportRequest
{
    [Required(ErrorMessage = "Say which list was exported.")]
    public string List { get; init; } = string.Empty;
}
