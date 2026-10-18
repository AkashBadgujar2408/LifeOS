using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class KnowledgeNote
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int? SkillId { get; set; }

    public string Title { get; set; } = null!;

    public string? Content { get; set; }

    public byte ReviewStage { get; set; }

    public DateOnly? NextReviewOn { get; set; }

    public DateOnly? LastReviewedOn { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual ICollection<KnowledgeNoteTag> KnowledgeNoteTags { get; set; } = new List<KnowledgeNoteTag>();

    public virtual Skill? Skill { get; set; }

    public virtual User User { get; set; } = null!;
}
