using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Course
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int? SkillId { get; set; }

    public int? LifeAreaId { get; set; }

    public string Title { get; set; } = null!;

    public string? Provider { get; set; }

    public string? Url { get; set; }

    public string Status { get; set; } = null!;

    public byte ProgressPercent { get; set; }

    public DateOnly? StartedOn { get; set; }

    public DateOnly? CompletedOn { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual ICollection<Certification> Certifications { get; set; } = new List<Certification>();

    public virtual LifeArea? LifeArea { get; set; }

    public virtual ICollection<RoadmapStep> RoadmapSteps { get; set; } = new List<RoadmapStep>();

    public virtual Skill? Skill { get; set; }

    public virtual ICollection<StudySession> StudySessions { get; set; } = new List<StudySession>();

    public virtual User User { get; set; } = null!;
}
