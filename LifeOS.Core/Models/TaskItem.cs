using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class TaskItem
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int? ProjectId { get; set; }

    public string Title { get; set; } = null!;

    public string? Notes { get; set; }

    public DateOnly? DueDate { get; set; }

    public string Priority { get; set; } = null!;

    public string Status { get; set; } = null!;

    public DateTime? CompletedAt { get; set; }

    public string? RecurrenceFrequency { get; set; }

    public int? RecurrenceInterval { get; set; }

    public DateOnly? RecurrenceAnchorDate { get; set; }

    public int? NextOccurrenceTaskId { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public int? EstimateMinutes { get; set; }

    public virtual ICollection<FocusSession> FocusSessions { get; set; } = new List<FocusSession>();

    public virtual ICollection<TaskItem> InverseNextOccurrenceTask { get; set; } = new List<TaskItem>();

    public virtual TaskItem? NextOccurrenceTask { get; set; }

    public virtual Project? Project { get; set; }

    public virtual ICollection<TaskDependency> TaskDependencyBlockedByTasks { get; set; } = new List<TaskDependency>();

    public virtual ICollection<TaskDependency> TaskDependencyTaskItems { get; set; } = new List<TaskDependency>();

    public virtual ICollection<TaskTag> TaskTags { get; set; } = new List<TaskTag>();

    public virtual User User { get; set; } = null!;
}
