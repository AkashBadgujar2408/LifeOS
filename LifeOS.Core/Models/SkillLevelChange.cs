using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class SkillLevelChange
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int SkillId { get; set; }

    public byte? FromProficiency { get; set; }

    public byte ToProficiency { get; set; }

    public DateOnly ChangedOn { get; set; }

    public string? Note { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Skill Skill { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
