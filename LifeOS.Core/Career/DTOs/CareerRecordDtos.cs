using System.ComponentModel.DataAnnotations;

namespace LifeOS.Core.Career.DTOs;

/// <summary>Matches CK_SideIncomeSources_Kind.</summary>
public static class SideIncomeKinds
{
    public const string Freelance = "Freelance";
    public const string Content = "Content";
    public const string Consulting = "Consulting";
    public const string Teaching = "Teaching";
    public const string Other = "Other";

    public static readonly IReadOnlySet<string> All =
        new HashSet<string>([Freelance, Content, Consulting, Teaching, Other], StringComparer.Ordinal);
}

/// <summary>Matches CK_SideIncomeSources_Status.</summary>
public static class SideIncomeStatuses
{
    public const string Active = "Active";
    public const string Paused = "Paused";
    public const string Ended = "Ended";

    public static readonly IReadOnlySet<string> All = new HashSet<string>([Active, Paused, Ended], StringComparer.Ordinal);
}

// ---- Resume versions ----

public class ResumeVersionDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? TargetRole { get; init; }
    public string? Notes { get; init; }
    public int FileCount { get; init; }
    public DateTime CreatedAt { get; init; }
    /// <summary>The applications it was sent with, most recently changed first.</summary>
    public List<ResumeApplicationDto> Applications { get; init; } = [];
}

public class ResumeApplicationDto
{
    public int Id { get; init; }
    public string Role { get; init; } = string.Empty;
    public string Organisation { get; init; } = string.Empty;
    public string Stage { get; init; } = string.Empty;
    public DateOnly? AppliedOn { get; init; }
}

public class ResumeVersionRequest
{
    [Required]
    [StringLength(200)]
    public string Name { get; init; } = string.Empty;

    [StringLength(200)]
    public string? TargetRole { get; init; }

    [StringLength(2000)]
    public string? Notes { get; init; }
}

// ---- Performance reviews ----

public class PerformanceReviewDto
{
    public int Id { get; init; }
    public int? EmploymentId { get; init; }
    public string? Organisation { get; init; }
    public string? Role { get; init; }
    public DateOnly ReviewedOn { get; init; }
    public string? PeriodLabel { get; init; }
    public string? Rating { get; init; }
    public string? Strengths { get; init; }
    public string? Improvements { get; init; }
    public string? Notes { get; init; }
}

public class PerformanceReviewRequest
{
    public int? EmploymentId { get; init; }
    public DateOnly ReviewedOn { get; init; }

    [StringLength(100)]
    public string? PeriodLabel { get; init; }

    [StringLength(100)]
    public string? Rating { get; init; }

    [StringLength(4000)]
    public string? Strengths { get; init; }

    [StringLength(4000)]
    public string? Improvements { get; init; }

    [StringLength(4000)]
    public string? Notes { get; init; }

    public DateOnly Today { get; init; }
}

// ---- Side income ----

public class SideIncomeSourceDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string Kind { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public DateOnly? StartedOn { get; init; }
    public DateOnly? EndedOn { get; init; }
    public string? Url { get; init; }
    public string? Notes { get; init; }
}

public class SideIncomeSourceRequest
{
    [Required]
    [StringLength(200)]
    public string Name { get; init; } = string.Empty;

    [Required]
    public string Kind { get; init; } = SideIncomeKinds.Freelance;

    [Required]
    public string Status { get; init; } = SideIncomeStatuses.Active;

    public DateOnly? StartedOn { get; init; }

    /// <summary>Only for an Ended source.</summary>
    public DateOnly? EndedOn { get; init; }

    [StringLength(2000)]
    public string? Url { get; init; }

    [StringLength(4000)]
    public string? Notes { get; init; }

    public DateOnly Today { get; init; }
}
