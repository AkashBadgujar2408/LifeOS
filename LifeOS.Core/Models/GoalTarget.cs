using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class GoalTarget
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int GoalId { get; set; }

    public string Kind { get; set; } = null!;

    public decimal StartValue { get; set; }

    public decimal TargetValue { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Goal Goal { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
