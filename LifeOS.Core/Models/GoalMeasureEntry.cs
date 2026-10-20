using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class GoalMeasureEntry
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int GoalId { get; set; }

    public DateOnly EntryDate { get; set; }

    public decimal Value { get; set; }

    public string Kind { get; set; } = null!;

    public string? Note { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Goal Goal { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
