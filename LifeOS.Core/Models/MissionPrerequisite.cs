using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class MissionPrerequisite
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int GoalId { get; set; }

    public int RequiresGoalId { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Goal Goal { get; set; } = null!;

    public virtual Goal RequiresGoal { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
