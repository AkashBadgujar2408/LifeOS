using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Book
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int? SkillId { get; set; }

    public int? LifeAreaId { get; set; }

    public string Title { get; set; } = null!;

    public string? Author { get; set; }

    public string Status { get; set; } = null!;

    public int? TotalPages { get; set; }

    public int CurrentPage { get; set; }

    public DateOnly? StartedOn { get; set; }

    public DateOnly? FinishedOn { get; set; }

    public byte? Rating { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual ICollection<BookNote> BookNotes { get; set; } = new List<BookNote>();

    public virtual ICollection<BookTag> BookTags { get; set; } = new List<BookTag>();

    public virtual LifeArea? LifeArea { get; set; }

    public virtual ICollection<RoadmapStep> RoadmapSteps { get; set; } = new List<RoadmapStep>();

    public virtual Skill? Skill { get; set; }

    public virtual ICollection<StudySession> StudySessions { get; set; } = new List<StudySession>();

    public virtual User User { get; set; } = null!;
}
