using System.ComponentModel.DataAnnotations;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Learning.DTOs;

public static class CourseStatuses
{
    public const string Planned = "Planned";
    public const string InProgress = "InProgress";
    public const string Completed = "Completed";
    public const string Dropped = "Dropped";
}

// ---- Skills ----

/// <summary>A skill on the inventory list.</summary>
public class SkillDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Description { get; init; }
    public byte Proficiency { get; init; }
    public byte? TargetProficiency { get; init; }
    public int? LifeAreaId { get; init; }
    public string? LifeAreaName { get; init; }
    public List<TagDto> Tags { get; init; } = [];
    public int CourseCount { get; init; }
    /// <summary>Books and other media read or watched for it (Leisure, Session 78a).</summary>
    public int MediaCount { get; init; }
    /// <summary>The local day of the latest level change (when it reached where it is).</summary>
    public DateOnly? LevelSince { get; init; }
}

public class SkillDetailDto : SkillDto
{
    /// <summary>Every level change, newest first; the oldest has no FromProficiency (where it started).</summary>
    public List<SkillLevelChangeDto> History { get; init; } = [];
    public List<LearningItemDto> Courses { get; init; } = [];
    public List<LearningItemDto> Media { get; init; } = [];
}

public class SkillLevelChangeDto
{
    public int Id { get; init; }
    public byte? FromProficiency { get; init; }
    public byte ToProficiency { get; init; }
    public DateOnly ChangedOn { get; init; }
    public string? Note { get; init; }
}

/// <summary>A course or book as a one-line reference (on a skill's page).</summary>
public class LearningItemDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    /// <summary>A media item's kind (Book, Film…); null for a course.</summary>
    public string? Kind { get; init; }
}

public class SkillRequest
{
    [Required]
    [StringLength(200)]
    public string Name { get; init; } = string.Empty;

    [StringLength(2000)]
    public string? Description { get; init; }

    [Range(1, 5, ErrorMessage = "Proficiency is 1 to 5.")]
    public byte Proficiency { get; init; } = 1;

    [Range(1, 5, ErrorMessage = "The target is 1 to 5.")]
    public byte? TargetProficiency { get; init; }

    public int? LifeAreaId { get; init; }

    public List<int> TagIds { get; init; } = [];

    /// <summary>The user's local day: when a new level (or a new skill) is recorded.</summary>
    public DateOnly Today { get; init; }

    /// <summary>Why the level changed ("passed the B1 exam"); kept with the level change, ignored otherwise.</summary>
    [StringLength(1000)]
    public string? LevelNote { get; init; }
}

// ---- Courses ----

public class CourseDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string? Provider { get; init; }
    public string? Url { get; init; }
    public string Status { get; init; } = CourseStatuses.Planned;
    public byte ProgressPercent { get; init; }
    public DateOnly? StartedOn { get; init; }
    public DateOnly? CompletedOn { get; init; }
    public string? Notes { get; init; }
    public int? SkillId { get; init; }
    public string? SkillName { get; init; }
    public int? LifeAreaId { get; init; }
    public string? LifeAreaName { get; init; }
}

public class CourseRequest
{
    [Required]
    [StringLength(200)]
    public string Title { get; init; } = string.Empty;

    [StringLength(200)]
    public string? Provider { get; init; }

    [StringLength(500)]
    public string? Url { get; init; }

    [Required]
    [AllowedValues(CourseStatuses.Planned, CourseStatuses.InProgress, CourseStatuses.Completed, CourseStatuses.Dropped,
        ErrorMessage = "Status must be Planned, InProgress, Completed or Dropped.")]
    public string Status { get; init; } = CourseStatuses.Planned;

    [Range(0, 100, ErrorMessage = "Progress is 0 to 100%.")]
    public byte ProgressPercent { get; init; }

    public DateOnly? StartedOn { get; init; }
    public DateOnly? CompletedOn { get; init; }

    [StringLength(10000)]
    public string? Notes { get; init; }

    public int? SkillId { get; init; }
    public int? LifeAreaId { get; init; }

    /// <summary>The user's local day: fills in a start or completion day the user didn't give.</summary>
    public DateOnly Today { get; init; }
}
