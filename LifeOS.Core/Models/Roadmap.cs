using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Roadmap
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int? GoalId { get; set; }

    public string Title { get; set; } = null!;

    public string? Description { get; set; }

    public string Status { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Goal? Goal { get; set; }

    public virtual ICollection<RoadmapStep> RoadmapSteps { get; set; } = new List<RoadmapStep>();

    public virtual User User { get; set; } = null!;
}
