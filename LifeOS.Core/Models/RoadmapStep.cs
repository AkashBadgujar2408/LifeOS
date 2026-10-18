using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class RoadmapStep
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int RoadmapId { get; set; }

    public string Title { get; set; } = null!;

    public int SortOrder { get; set; }

    public int? CourseId { get; set; }

    public int? BookId { get; set; }

    public int? GoalId { get; set; }

    public DateTime? CompletedAt { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Book? Book { get; set; }

    public virtual Course? Course { get; set; }

    public virtual Goal? Goal { get; set; }

    public virtual Roadmap Roadmap { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
