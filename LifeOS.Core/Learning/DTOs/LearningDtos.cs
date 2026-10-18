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

public static class BookStatuses
{
    public const string WantToRead = "WantToRead";
    public const string Reading = "Reading";
    public const string Finished = "Finished";
    public const string Abandoned = "Abandoned";
}

public static class BookNoteKinds
{
    public const string Note = "Note";
    public const string Highlight = "Highlight";
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
    public int BookCount { get; init; }
    /// <summary>The local day of the latest level change (when it reached where it is).</summary>
    public DateOnly? LevelSince { get; init; }
}

public class SkillDetailDto : SkillDto
{
    /// <summary>Every level change, newest first; the oldest has no FromProficiency (where it started).</summary>
    public List<SkillLevelChangeDto> History { get; init; } = [];
    public List<LearningItemDto> Courses { get; init; } = [];
    public List<LearningItemDto> Books { get; init; } = [];
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

// ---- Books ----

public class BookDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string? Author { get; init; }
    public string Status { get; init; } = BookStatuses.WantToRead;
    public int? TotalPages { get; init; }
    public int CurrentPage { get; init; }
    /// <summary>Worked out by the API (LearningRules.BookPercent); null when the page count is unknown.</summary>
    public int? ProgressPercent { get; set; }
    public DateOnly? StartedOn { get; init; }
    public DateOnly? FinishedOn { get; init; }
    public byte? Rating { get; init; }
    public int? SkillId { get; init; }
    public string? SkillName { get; init; }
    public int? LifeAreaId { get; init; }
    public string? LifeAreaName { get; init; }
    public List<TagDto> Tags { get; init; } = [];
    public int NoteCount { get; init; }
}

public class BookDetailDto : BookDto
{
    /// <summary>Notes and highlights, by page (unpaged ones last), then oldest first.</summary>
    public List<BookNoteDto> Notes { get; init; } = [];
}

public class BookNoteDto
{
    public int Id { get; init; }
    public string Kind { get; init; } = BookNoteKinds.Note;
    public string Text { get; init; } = string.Empty;
    public int? Page { get; init; }
    public DateTime CreatedAt { get; init; }
}

public class BookRequest
{
    [Required]
    [StringLength(200)]
    public string Title { get; init; } = string.Empty;

    [StringLength(200)]
    public string? Author { get; init; }

    [Required]
    [AllowedValues(BookStatuses.WantToRead, BookStatuses.Reading, BookStatuses.Finished, BookStatuses.Abandoned,
        ErrorMessage = "Status must be WantToRead, Reading, Finished or Abandoned.")]
    public string Status { get; init; } = BookStatuses.WantToRead;

    [Range(1, 100000, ErrorMessage = "Pages are 1 to 100,000.")]
    public int? TotalPages { get; init; }

    [Range(0, 100000, ErrorMessage = "The current page is 0 to 100,000.")]
    public int CurrentPage { get; init; }

    public DateOnly? StartedOn { get; init; }
    public DateOnly? FinishedOn { get; init; }

    [Range(1, 5, ErrorMessage = "Ratings are 1 to 5.")]
    public byte? Rating { get; init; }

    public int? SkillId { get; init; }
    public int? LifeAreaId { get; init; }
    public List<int> TagIds { get; init; } = [];

    /// <summary>The user's local day: fills in a start or finish day the user didn't give.</summary>
    public DateOnly Today { get; init; }
}

/// <summary>"I'm on page 212": starts a book that wasn't started, finishes it on the last page.</summary>
public class BookProgressRequest
{
    [Range(0, 100000, ErrorMessage = "The current page is 0 to 100,000.")]
    public int CurrentPage { get; init; }

    public DateOnly Today { get; init; }
}

public class BookNoteRequest
{
    [Required]
    [AllowedValues(BookNoteKinds.Note, BookNoteKinds.Highlight, ErrorMessage = "A note is a Note or a Highlight.")]
    public string Kind { get; init; } = BookNoteKinds.Note;

    [Required]
    [StringLength(4000)]
    public string Text { get; init; } = string.Empty;

    [Range(1, 100000, ErrorMessage = "Pages are 1 to 100,000.")]
    public int? Page { get; init; }
}
