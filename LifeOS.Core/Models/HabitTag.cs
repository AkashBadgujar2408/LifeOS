using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class HabitTag
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int HabitId { get; set; }

    public int TagId { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Habit Habit { get; set; } = null!;

    public virtual Tag Tag { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
