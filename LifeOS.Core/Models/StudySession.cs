using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class StudySession
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int? SkillId { get; set; }

    public int? CourseId { get; set; }

    public string? Topic { get; set; }

    public DateOnly StudiedOn { get; set; }

    public int Minutes { get; set; }

    public DateTime? StartedAt { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public int? MediaItemId { get; set; }

    public virtual Course? Course { get; set; }

    public virtual MediaItem? MediaItem { get; set; }

    public virtual Skill? Skill { get; set; }

    public virtual User User { get; set; } = null!;
}
