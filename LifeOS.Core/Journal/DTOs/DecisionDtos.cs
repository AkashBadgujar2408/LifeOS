using System.ComponentModel.DataAnnotations;

namespace LifeOS.Core.Journal.DTOs;

/// <summary>How a decision turned out against what was expected; matches CK_Decisions_Verdict. Never rename one.</summary>
public static class DecisionVerdicts
{
    public const string Better = "Better";
    public const string AsExpected = "AsExpected";
    public const string Worse = "Worse";

    public static readonly IReadOnlyList<string> All = [Better, AsExpected, Worse];
}

public static class DecisionErrors
{
    public const string NotFound = "Decision not found.";
}

public class DecisionDto
{
    public int Id { get; init; }
    public DateOnly DecidedOn { get; init; }
    public string Title { get; init; } = string.Empty;
    public string? Reasons { get; init; }
    public string? ExpectedOutcome { get; init; }
    /// <summary>The day to look back on it; a reminder fires at 09:00 that morning until the outcome is recorded.</summary>
    public DateOnly? ReviewOn { get; init; }
    public int? ReviewReminderId { get; init; }
    public string? ActualOutcome { get; init; }
    public string? Verdict { get; init; }
    /// <summary>Set once the outcome is recorded.</summary>
    public DateOnly? ReviewedOn { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime? UpdatedAt { get; init; }
}

/// <summary>The decision itself — what was decided, why, what's expected and when to look back.</summary>
public class DecisionRequest
{
    [Required]
    public DateOnly? DecidedOn { get; init; }

    [Required(ErrorMessage = "Say what you decided.")]
    [StringLength(300)]
    public string Title { get; init; } = string.Empty;

    [StringLength(4000)]
    public string? Reasons { get; init; }

    [StringLength(4000)]
    public string? ExpectedOutcome { get; init; }

    public DateOnly? ReviewOn { get; init; }

    /// <summary>The browser's IANA zone, for the review reminder's 09:00 when no zone is set in Settings.</summary>
    [StringLength(64)]
    public string? TimeZone { get; init; }
}

/// <summary>What actually happened. A blank outcome clears it (the decision is open again).</summary>
public class DecisionOutcomeRequest
{
    [StringLength(4000)]
    public string? ActualOutcome { get; init; }

    public string? Verdict { get; init; }

    /// <summary>The user's local today — the day it's recorded as reviewed.</summary>
    [Required]
    public DateOnly? Today { get; init; }

    [StringLength(64)]
    public string? TimeZone { get; init; }
}
