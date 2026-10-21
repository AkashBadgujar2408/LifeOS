using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class MediaItem
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int? SkillId { get; set; }

    public int? LifeAreaId { get; set; }

    public string Kind { get; set; } = null!;

    public string Title { get; set; } = null!;

    public string? Creator { get; set; }

    public string? WhereToFind { get; set; }

    public string Status { get; set; } = null!;

    public bool UpNext { get; set; }

    public int? TotalPages { get; set; }

    public int CurrentPage { get; set; }

    public short? Season { get; set; }

    public short? Episode { get; set; }

    public DateOnly? StartedOn { get; set; }

    public DateOnly? FinishedOn { get; set; }

    public byte? Rating { get; set; }

    public string? Review { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual LifeArea? LifeArea { get; set; }

    public virtual ICollection<MediaItemTag> MediaItemTags { get; set; } = new List<MediaItemTag>();

    public virtual ICollection<MediaLog> MediaLogs { get; set; } = new List<MediaLog>();

    public virtual ICollection<MediaNote> MediaNotes { get; set; } = new List<MediaNote>();

    public virtual ICollection<RoadmapStep> RoadmapSteps { get; set; } = new List<RoadmapStep>();

    public virtual Skill? Skill { get; set; }

    public virtual ICollection<StudySession> StudySessions { get; set; } = new List<StudySession>();

    public virtual User User { get; set; } = null!;
}
