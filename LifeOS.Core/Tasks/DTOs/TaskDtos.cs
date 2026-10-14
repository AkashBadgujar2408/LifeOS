using System.ComponentModel.DataAnnotations;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Tasks.DTOs;

public static class TaskPriorities
{
    public const string None = "None";
    public const string Low = "Low";
    public const string Medium = "Medium";
    public const string High = "High";
}

public static class TaskStatuses
{
    public const string Open = "Open";
    public const string Done = "Done";
}

public static class RecurrenceFrequencies
{
    public const string Daily = "Daily";
    public const string Weekly = "Weekly";
    public const string Monthly = "Monthly";
    public const string Yearly = "Yearly";
}

/// <summary>"Every {Interval} {Frequency}", e.g. every 2 weeks.</summary>
public class TaskRecurrenceDto
{
    [Required]
    [AllowedValues(RecurrenceFrequencies.Daily, RecurrenceFrequencies.Weekly, RecurrenceFrequencies.Monthly, RecurrenceFrequencies.Yearly,
        ErrorMessage = "Repeat must be Daily, Weekly, Monthly or Yearly.")]
    public string Frequency { get; init; } = string.Empty;

    [Range(1, 999, ErrorMessage = "Repeat every 1 to 999.")]
    public int Interval { get; init; } = 1;
}

public class TaskItemDto
{
    public int Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string? Notes { get; init; }
    /// <summary>Calendar date; null = Someday.</summary>
    public DateOnly? DueDate { get; init; }
    public string Priority { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public DateTime? CompletedAt { get; init; }
    public int? ProjectId { get; init; }
    public string? ProjectName { get; init; }
    public TaskRecurrenceDto? Recurrence { get; init; }
    public List<TagDto> Tags { get; init; } = [];
    public DateTime CreatedAt { get; init; }
}

public class TaskRequest
{
    [Required]
    [StringLength(300)]
    public string Title { get; init; } = string.Empty;

    [StringLength(4000)]
    public string? Notes { get; init; }

    public DateOnly? DueDate { get; init; }

    [Required]
    [AllowedValues(TaskPriorities.None, TaskPriorities.Low, TaskPriorities.Medium, TaskPriorities.High,
        ErrorMessage = "Priority must be None, Low, Medium or High.")]
    public string Priority { get; init; } = TaskPriorities.None;

    public int? ProjectId { get; init; }

    /// <summary>Null = doesn't repeat. Requires a due date (the first occurrence).</summary>
    public TaskRecurrenceDto? Recurrence { get; init; }

    public List<int> TagIds { get; init; } = [];
}

public class SetTaskCompletedRequest
{
    public bool Completed { get; init; }

    /// <summary>The user's local date; decides where a repeating task's next occurrence lands. Defaults to UTC today.</summary>
    public DateOnly? Today { get; init; }
}

public class SetTaskCompletedResult
{
    public TaskItemDto Task { get; init; } = null!;

    /// <summary>The next instance of a repeating task, when completing it created one.</summary>
    public TaskItemDto? NextOccurrence { get; init; }
}
