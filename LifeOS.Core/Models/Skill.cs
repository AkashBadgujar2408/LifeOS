using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Skill
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int? LifeAreaId { get; set; }

    public string Name { get; set; } = null!;

    public string? Description { get; set; }

    public byte Proficiency { get; set; }

    public byte? TargetProficiency { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual ICollection<Book> Books { get; set; } = new List<Book>();

    public virtual ICollection<Certification> Certifications { get; set; } = new List<Certification>();

    public virtual ICollection<Course> Courses { get; set; } = new List<Course>();

    public virtual ICollection<KnowledgeNote> KnowledgeNotes { get; set; } = new List<KnowledgeNote>();

    public virtual LifeArea? LifeArea { get; set; }

    public virtual ICollection<SkillLevelChange> SkillLevelChanges { get; set; } = new List<SkillLevelChange>();

    public virtual ICollection<SkillTag> SkillTags { get; set; } = new List<SkillTag>();

    public virtual ICollection<StudySession> StudySessions { get; set; } = new List<StudySession>();

    public virtual User User { get; set; } = null!;
}
