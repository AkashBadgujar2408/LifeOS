using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class MonthlyReflection
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public DateOnly MonthStart { get; set; }

    public string? Highlights { get; set; }

    public string? Learned { get; set; }

    public string? WouldChange { get; set; }

    public string? NextFocus { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual User User { get; set; } = null!;
}
