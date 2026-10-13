using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class EntityLink
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string SourceEntityType { get; set; } = null!;

    public int SourceEntityId { get; set; }

    public string TargetEntityType { get; set; } = null!;

    public int TargetEntityId { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual User User { get; set; } = null!;
}
