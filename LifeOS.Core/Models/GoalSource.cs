using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class GoalSource
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int GoalId { get; set; }

    public string Kind { get; set; } = null!;

    public string? EntityType { get; set; }

    public int? EntityId { get; set; }

    public string? Filter { get; set; }

    public string? Metric { get; set; }

    public DateOnly CountsFrom { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Goal Goal { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
