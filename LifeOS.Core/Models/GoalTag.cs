using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class GoalTag
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int GoalId { get; set; }

    public int TagId { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Goal Goal { get; set; } = null!;

    public virtual Tag Tag { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
