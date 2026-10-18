using System.ComponentModel.DataAnnotations;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Career.DTOs;

/// <summary>Matches CK_JobApplications_Stage. Never rename one once stored.</summary>
public static class ApplicationStages
{
    public const string Saved = "Saved";
    public const string Applied = "Applied";
    public const string Interview = "Interview";
    public const string Offer = "Offer";
    public const string Accepted = "Accepted";
    public const string Rejected = "Rejected";
    public const string Withdrawn = "Withdrawn";

    public static readonly IReadOnlySet<string> All =
        new HashSet<string>([Saved, Applied, Interview, Offer, Accepted, Rejected, Withdrawn], StringComparer.Ordinal);

    /// <summary>Stages that mean it was applied for (CK_JobApplications_Applied: AppliedOn is required).</summary>
    public static readonly IReadOnlySet<string> AppliedFor =
        new HashSet<string>([Applied, Interview, Offer, Accepted], StringComparer.Ordinal);

    /// <summary>Stages that end it (CK_JobApplications_Closed: ClosedOn exactly then).</summary>
    public static readonly IReadOnlySet<string> Closed =
        new HashSet<string>([Accepted, Rejected, Withdrawn], StringComparer.Ordinal);
}

/// <summary>Matches CK_Interviews_Outcome; null = not known yet.</summary>
public static class InterviewOutcomes
{
    public const string Passed = "Passed";
    public const string Failed = "Failed";

    public static readonly IReadOnlySet<string> All = new HashSet<string>([Passed, Failed], StringComparer.Ordinal);
}

// ---- Applications ----

public class JobApplicationDto
{
    public int Id { get; init; }
    public string Organisation { get; init; } = string.Empty;
    public string Role { get; init; } = string.Empty;
    public string Stage { get; init; } = string.Empty;
    public DateOnly? AppliedOn { get; init; }
    public DateOnly? ClosedOn { get; init; }
    /// <summary>The day it reached its current stage (the latest stage change).</summary>
    public DateOnly? StageSince { get; init; }
    public string? Source { get; init; }
    public string? Url { get; init; }
    public int? ContactId { get; init; }
    public string? ContactName { get; init; }
    public int? ResumeVersionId { get; init; }
    public string? ResumeVersionName { get; init; }
    public string? Notes { get; init; }
    public int InterviewCount { get; init; }
    /// <summary>The earliest scheduled round that hasn't ended yet (UTC), if any.</summary>
    public DateTime? NextInterviewAt { get; init; }
}

public class JobApplicationDetailDto : JobApplicationDto
{
    /// <summary>Oldest first; the first has no FromStage.</summary>
    public List<ApplicationStageChangeDto> History { get; init; } = [];
    /// <summary>Scheduled ones by time, then unscheduled ones in the order they were added.</summary>
    public List<InterviewDto> Interviews { get; init; } = [];
}

public class ApplicationStageChangeDto
{
    public int Id { get; init; }
    public string? FromStage { get; init; }
    public string ToStage { get; init; } = string.Empty;
    public DateOnly ChangedOn { get; init; }
    public string? Note { get; init; }
}

/// <summary>
/// An application's details. The stage only changes through <c>…/{id}/stage</c>; <see cref="Stage"/> and
/// <see cref="StageOn"/> are read on create only (where it starts, and the day it got there).
/// </summary>
public class JobApplicationRequest
{
    [Required]
    [StringLength(200)]
    public string Organisation { get; init; } = string.Empty;

    [Required]
    [StringLength(200)]
    public string Role { get; init; } = string.Empty;

    [StringLength(200)]
    public string? Source { get; init; }

    [StringLength(2000)]
    public string? Url { get; init; }

    public int? ContactId { get; init; }
    public int? ResumeVersionId { get; init; }

    [StringLength(4000)]
    public string? Notes { get; init; }

    /// <summary>Create only: the starting stage (default Saved).</summary>
    public string Stage { get; init; } = ApplicationStages.Saved;

    /// <summary>Create only: the day it reached that stage (default today).</summary>
    public DateOnly? StageOn { get; init; }

    public DateOnly Today { get; init; }
}

/// <summary>
/// Move an application to another stage on a day, with an optional note. Moving to Interview can schedule its
/// first round at the same time (<see cref="Interview"/>), which puts it on the calendar.
/// </summary>
public class ApplicationStageRequest
{
    [Required]
    public string Stage { get; init; } = string.Empty;

    public DateOnly On { get; init; }

    [StringLength(1000)]
    public string? Note { get; init; }

    public InterviewRequest? Interview { get; init; }

    public DateOnly Today { get; init; }
}

// ---- Interview rounds ----

public class InterviewDto
{
    public int Id { get; init; }
    public int JobApplicationId { get; init; }
    public string Title { get; init; } = string.Empty;
    /// <summary>The round's calendar entry; null while it isn't scheduled.</summary>
    public int? EventId { get; init; }
    public DateTime? StartsAt { get; init; }
    public DateTime? EndsAt { get; init; }
    public string? Location { get; init; }
    public string? PrepNotes { get; init; }
    public string? ReviewNotes { get; init; }
    public string? Outcome { get; init; }
}

/// <summary>A round; give both times (UTC, with a "Z") to schedule it on the calendar, neither to leave it open.</summary>
public class InterviewRequest
{
    [Required]
    [StringLength(200)]
    public string Title { get; init; } = string.Empty;

    public DateTime? StartsAt { get; init; }
    public DateTime? EndsAt { get; init; }

    [StringLength(200)]
    public string? Location { get; init; }

    [StringLength(4000)]
    public string? PrepNotes { get; init; }

    [StringLength(4000)]
    public string? ReviewNotes { get; init; }

    public string? Outcome { get; init; }
}

// ---- Question bank ----

public class InterviewQuestionDto
{
    public int Id { get; init; }
    public string Question { get; init; } = string.Empty;
    public string? Answer { get; init; }
    public string? ReviewNotes { get; init; }
    public DateOnly? LastPractisedOn { get; init; }
    /// <summary>Asked in this application; null = a general question.</summary>
    public int? JobApplicationId { get; init; }
    public string? ApplicationTitle { get; init; }
    public List<TagDto> Tags { get; init; } = [];
}

public class InterviewQuestionRequest
{
    [Required]
    [StringLength(1000)]
    public string Question { get; init; } = string.Empty;

    public string? Answer { get; init; }

    [StringLength(4000)]
    public string? ReviewNotes { get; init; }

    public int? JobApplicationId { get; init; }

    /// <summary>Replaced as a whole on every save.</summary>
    public List<int> TagIds { get; init; } = [];
}

/// <summary>"I went over it today."</summary>
public class QuestionPractisedRequest
{
    public DateOnly Today { get; init; }
}
