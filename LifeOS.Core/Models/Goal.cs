using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Goal
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int LifeAreaId { get; set; }

    public string Title { get; set; } = null!;

    public string? Description { get; set; }

    public string GoalType { get; set; } = null!;

    public string Status { get; set; } = null!;

    public DateOnly? TargetDate { get; set; }

    public DateTime? CompletedAt { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual ICollection<GoalHistory> GoalHistories { get; set; } = new List<GoalHistory>();

    public virtual ICollection<GoalMilestone> GoalMilestones { get; set; } = new List<GoalMilestone>();

    public virtual ICollection<GoalTag> GoalTags { get; set; } = new List<GoalTag>();

    public virtual LifeArea LifeArea { get; set; } = null!;

    public virtual MissionDebrief? MissionDebrief { get; set; }

    public virtual ICollection<MissionPrerequisite> MissionPrerequisiteGoals { get; set; } = new List<MissionPrerequisite>();

    public virtual ICollection<MissionPrerequisite> MissionPrerequisiteRequiresGoals { get; set; } = new List<MissionPrerequisite>();

    public virtual User User { get; set; } = null!;
}
