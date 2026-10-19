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
