using System.ComponentModel.DataAnnotations;

namespace LifeOS.Core.Career.DTOs;

/// <summary>Matches CK_Employments_EmploymentType. Never rename one once stored.</summary>
public static class EmploymentTypes
{
    public const string FullTime = "FullTime";
    public const string PartTime = "PartTime";
    public const string Contract = "Contract";
    public const string Freelance = "Freelance";
    public const string Internship = "Internship";

    public static readonly IReadOnlySet<string> All =
        new HashSet<string>([FullTime, PartTime, Contract, Freelance, Internship], StringComparer.Ordinal);
}

/// <summary>Matches CK_SalaryRecords_Period.</summary>
public static class SalaryPeriods
{
    public const string Year = "Year";
    public const string Month = "Month";
    public const string Hour = "Hour";

    public static readonly IReadOnlySet<string> All = new HashSet<string>([Year, Month, Hour], StringComparer.Ordinal);
}

/// <summary>Matches CK_SalaryRecords_Reason.</summary>
public static class SalaryReasons
{
    public const string Starting = "Starting";
    public const string Raise = "Raise";
    public const string Promotion = "Promotion";
    public const string Adjustment = "Adjustment";
    public const string Other = "Other";

    public static readonly IReadOnlySet<string> All =
        new HashSet<string>([Starting, Raise, Promotion, Adjustment, Other], StringComparer.Ordinal);
}

/// <summary>Matches CK_CareerAchievements_Kind.</summary>
public static class CareerAchievementKinds
{
    public const string Project = "Project";
    public const string Promotion = "Promotion";
    public const string Award = "Award";
    public const string Contribution = "Contribution";
    public const string Other = "Other";

    public static readonly IReadOnlySet<string> All =
        new HashSet<string>([Project, Promotion, Award, Contribution, Other], StringComparer.Ordinal);
}

// ---- Employments (roles) ----

public class EmploymentDto
{
    public int Id { get; init; }
    public string Organisation { get; init; } = string.Empty;
    public string Role { get; init; } = string.Empty;
    public string EmploymentType { get; init; } = string.Empty;
    public string? Location { get; init; }
    public DateOnly StartDate { get; init; }
    /// <summary>Null = still in this role.</summary>
    public DateOnly? EndDate { get; init; }
    public string? Description { get; init; }
    public int AchievementCount { get; init; }
}

public class EmploymentRequest
{
    [Required]
    [StringLength(200)]
    public string Organisation { get; init; } = string.Empty;

    [Required]
    [StringLength(200)]
    public string Role { get; init; } = string.Empty;

    [Required]
    public string EmploymentType { get; init; } = EmploymentTypes.FullTime;

    [StringLength(200)]
    public string? Location { get; init; }

    public DateOnly StartDate { get; init; }
    public DateOnly? EndDate { get; init; }

    [StringLength(4000)]
    public string? Description { get; init; }

    /// <summary>The client's local today: a role can't start later than the day after it.</summary>
    public DateOnly Today { get; init; }
}

/// <summary>
/// A promotion: the current role ends the day before <see cref="On"/>, a new role at the same organisation starts on
/// it, a Promotion achievement is recorded for the new role and, when given, its new pay — all at once.
/// </summary>
public class PromotionRequest
{
    [Required]
    [StringLength(200)]
    public string NewRole { get; init; } = string.Empty;

    public DateOnly On { get; init; }

    [StringLength(4000)]
    public string? Note { get; init; }

    /// <summary>The new pay, or null to leave the salary history alone.</summary>
    public SalaryAmount? Salary { get; init; }

    public DateOnly Today { get; init; }
}

public class SalaryAmount
{
    [Range(typeof(decimal), "0.0001", "999999999999999", ErrorMessage = "Enter an amount above zero.")]
    public decimal Amount { get; init; }

    [Required]
    [StringLength(3, MinimumLength = 3)]
    public string Currency { get; init; } = string.Empty;

    [Required]
    public string Period { get; init; } = SalaryPeriods.Year;
}

public class PromotionResultDto
{
    public EmploymentDto PreviousRole { get; init; } = null!;
    public EmploymentDto NewRole { get; init; } = null!;
    public int AchievementId { get; init; }
    public int? SalaryRecordId { get; init; }
}

// ---- Salary history ----

public class SalaryRecordDto
{
    public int Id { get; init; }
    public int? EmploymentId { get; init; }
    public string? Organisation { get; init; }
    public string? Role { get; init; }
    public DateOnly EffectiveOn { get; init; }
    public decimal Amount { get; init; }
    public string Currency { get; init; } = string.Empty;
    public string Period { get; init; } = string.Empty;
    public string Reason { get; init; } = string.Empty;
    public string? Note { get; init; }
    /// <summary>
    /// Change from the record before it with the same currency and period, in % (one decimal); null for the first
    /// such record (SalaryHistory.Changes).
    /// </summary>
    public decimal? ChangePercent { get; set; }
}

public class SalaryRecordRequest
{
    public int? EmploymentId { get; init; }
    public DateOnly EffectiveOn { get; init; }

    [Range(typeof(decimal), "0.0001", "999999999999999", ErrorMessage = "Enter an amount above zero.")]
    public decimal Amount { get; init; }

    [Required]
    [StringLength(3, MinimumLength = 3)]
    public string Currency { get; init; } = string.Empty;

    [Required]
    public string Period { get; init; } = SalaryPeriods.Year;

    [Required]
    public string Reason { get; init; } = SalaryReasons.Starting;

    [StringLength(1000)]
    public string? Note { get; init; }

    public DateOnly Today { get; init; }
}

// ---- Achievements ----

public class CareerAchievementDto
{
    public int Id { get; init; }
    public int? EmploymentId { get; init; }
    public string? Organisation { get; init; }
    public string? Role { get; init; }
    public string Kind { get; init; } = string.Empty;
    public string Title { get; init; } = string.Empty;
    public DateOnly AchievedOn { get; init; }
    public string? Description { get; init; }
}

public class CareerAchievementRequest
{
    public int? EmploymentId { get; init; }

    [Required]
    public string Kind { get; init; } = CareerAchievementKinds.Project;

    [Required]
    [StringLength(200)]
    public string Title { get; init; } = string.Empty;

    public DateOnly AchievedOn { get; init; }

    [StringLength(4000)]
    public string? Description { get; init; }

    public DateOnly Today { get; init; }
}
