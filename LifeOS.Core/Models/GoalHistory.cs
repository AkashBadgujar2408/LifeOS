using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class GoalHistory
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int GoalId { get; set; }

    public string EventType { get; set; } = null!;

    public string? FromStatus { get; set; }

    public string? ToStatus { get; set; }

    public string? ChangedFields { get; set; }

    public DateOnly? PreviousTargetDate { get; set; }

    public DateOnly? NewTargetDate { get; set; }

    public string? Note { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Goal Goal { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
