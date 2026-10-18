using System.ComponentModel.DataAnnotations;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Learning.DTOs;

public static class RoadmapStatuses
{
    public const string Active = "Active";
    public const string Completed = "Completed";
    public const string Archived = "Archived";
}

/// <summary>What a roadmap step can point at (at most one).</summary>
public static class RoadmapStepTargets
{
    public const string Course = "Course";
    public const string Book = "Book";
    public const string Goal = "Goal";
}

// ---- Roadmaps ----

public class RoadmapDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string? Description { get; init; }
    public string Status { get; init; } = RoadmapStatuses.Active;
    public int? GoalId { get; init; }
    public string? GoalTitle { get; init; }
    public int StepCount { get; init; }
    public int CompletedStepCount { get; init; }
    /// <summary>Worked out by the API (RoadmapProgress.Percent).</summary>
    public int ProgressPercent { get; set; }
    /// <summary>The first step not yet done, in order.</summary>
    public string? NextStepTitle { get; init; }
}

public class RoadmapDetailDto : RoadmapDto
{
    public List<RoadmapStepDto> Steps { get; init; } = [];
}

public class RoadmapStepDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public int SortOrder { get; init; }
    public DateTime? CompletedAt { get; init; }
    /// <summary>Course / Book / Goal, or null for a plain step.</summary>
    public string? TargetType { get; init; }
    public int? TargetId { get; init; }
    public string? TargetTitle { get; init; }
    /// <summary>The target's own status ("Completed", "Reading"…), so a finished course shows next to its step.</summary>
    public string? TargetStatus { get; init; }
}

public class RoadmapRequest
{
    [Required]
    [StringLength(200)]
    public string Title { get; init; } = string.Empty;

    [StringLength(2000)]
    public string? Description { get; init; }

    [Required]
    [AllowedValues(RoadmapStatuses.Active, RoadmapStatuses.Completed, RoadmapStatuses.Archived,
        ErrorMessage = "Status must be Active, Completed or Archived.")]
    public string Status { get; init; } = RoadmapStatuses.Active;

    public int? GoalId { get; init; }
}

public class RoadmapStepRequest
{
    [Required]
    [StringLength(200)]
    public string Title { get; init; } = string.Empty;

    [AllowedValues(null, RoadmapStepTargets.Course, RoadmapStepTargets.Book, RoadmapStepTargets.Goal,
        ErrorMessage = "A step points at a Course, a Book or a Goal.")]
    public string? TargetType { get; init; }

    public int? TargetId { get; init; }
}

public class SetStepCompletedRequest
{
    public bool Completed { get; init; }
}

public class ReorderStepsRequest
{
    [Required]
    public List<int> StepIds { get; init; } = [];
}

/// <summary>A step ticked or unticked, and what that did to the roadmap.</summary>
public class StepCompletedResultDto
{
    public RoadmapDetailDto Roadmap { get; init; } = new();
    /// <summary>The roadmap's status changed by this (finished on the last step, reopened when one was unticked).</summary>
    public string? StatusChangedTo { get; init; }
}

// ---- Study sessions ----

public class StudySessionDto
{
    public int Id { get; init; }
    public DateOnly StudiedOn { get; init; }
    public int Minutes { get; init; }
    public string? Topic { get; init; }
    public int? SkillId { get; init; }
    public string? SkillName { get; init; }
    public int? CourseId { get; init; }
    public string? CourseTitle { get; init; }
    public int? BookId { get; init; }
    public string? BookTitle { get; init; }
    public DateTime? StartedAt { get; init; }
    public string? Notes { get; init; }
}

/// <summary>Hours by subject over time (StudyAnalytics): one series per subject, one value per week.</summary>
public class StudyAnalyticsDto
{
    /// <summary>The Mondays of the weeks shown, oldest first.</summary>
    public List<DateOnly> Weeks { get; init; } = [];
    /// <summary>Most studied first; past the top few, the rest are one "Everything else" series.</summary>
    public List<StudySubjectSeriesDto> Subjects { get; init; } = [];
    public int TotalMinutes { get; init; }
}

public class StudySubjectSeriesDto
{
    /// <summary>Skill / Course / Book / Topic, or Other (the rest folded together).</summary>
    public string Kind { get; init; } = string.Empty;
    public int? Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public int TotalMinutes { get; init; }
    /// <summary>Minutes per week, in step with <see cref="StudyAnalyticsDto.Weeks"/>.</summary>
    public List<int> MinutesByWeek { get; init; } = [];
}

public static class StudySubjectKinds
{
    public const string Skill = "Skill";
    public const string Course = "Course";
    public const string Book = "Book";
    public const string Topic = "Topic";
    public const string Other = "Other";
}

public class StudySessionRequest
{
    public DateOnly StudiedOn { get; init; }

    [Range(1, 1440, ErrorMessage = "A study session is 1 to 1440 minutes.")]
    public int Minutes { get; init; }

    [StringLength(200)]
    public string? Topic { get; init; }

    public int? SkillId { get; init; }
    public int? CourseId { get; init; }
    public int? BookId { get; init; }

    /// <summary>Set when the study timer logged it (UTC, with a "Z").</summary>
    public DateTime? StartedAt { get; init; }

    [StringLength(2000)]
    public string? Notes { get; init; }

    /// <summary>The user's local day: a session can't be on a later day.</summary>
    public DateOnly Today { get; init; }
}

// ---- Certifications ----

public class CertificationDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Issuer { get; init; }
    public string? CredentialId { get; init; }
    public string? Url { get; init; }
    public DateOnly IssuedOn { get; init; }
    public DateOnly? ExpiresOn { get; init; }
    public int? RenewalReminderDays { get; init; }
    public int? SkillId { get; init; }
    public string? SkillName { get; init; }
    public int? CourseId { get; init; }
    public string? CourseTitle { get; init; }
}

public class CertificationRequest
{
    [Required]
    [StringLength(200)]
    public string Name { get; init; } = string.Empty;

    [StringLength(200)]
    public string? Issuer { get; init; }

    [StringLength(100)]
    public string? CredentialId { get; init; }

    [StringLength(500)]
    public string? Url { get; init; }

    public DateOnly IssuedOn { get; init; }
    public DateOnly? ExpiresOn { get; init; }

    /// <summary>Remind me this many days before it expires (0-365); null = no reminder. Needs an expiry.</summary>
    [Range(0, 365, ErrorMessage = "Remind me 0 to 365 days before.")]
    public int? RenewalReminderDays { get; init; }

    public int? SkillId { get; init; }
    public int? CourseId { get; init; }

    /// <summary>The browser's IANA zone, used for the 09:00 reminder when Settings has none.</summary>
    [StringLength(64)]
    public string? TimeZone { get; init; }
}

// ---- Knowledge notes + revision planner ----

public class KnowledgeNoteDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string? Content { get; init; }
    public int? SkillId { get; init; }
    public string? SkillName { get; init; }
    /// <summary>Reviews in a row that went well (0 = new).</summary>
    public byte ReviewStage { get; init; }
    /// <summary>Null = not being reviewed.</summary>
    public DateOnly? NextReviewOn { get; init; }
    public DateOnly? LastReviewedOn { get; init; }
    public DateTime UpdatedAt { get; init; }
    public List<TagDto> Tags { get; init; } = [];
}

public class KnowledgeNoteRequest
{
    [Required]
    [StringLength(200)]
    public string Title { get; init; } = string.Empty;

    [StringLength(20000)]
    public string? Content { get; init; }

    public int? SkillId { get; init; }

    /// <summary>Keep this note in the revision planner. Turning it on schedules the first review for tomorrow.</summary>
    public bool Review { get; init; }

    public DateOnly Today { get; init; }

    /// <summary>The note's tags, replaced as a whole on every save.</summary>
    public List<int> TagIds { get; init; } = [];
}

public class ReviewNoteRequest
{
    /// <summary>True: it came back easily (the next review waits longer). False: start the intervals again.</summary>
    public bool Remembered { get; init; }

    public DateOnly Today { get; init; }
}
