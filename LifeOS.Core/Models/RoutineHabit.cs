using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class RoutineHabit
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int RoutineId { get; set; }

    public int HabitId { get; set; }

    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Habit Habit { get; set; } = null!;

    public virtual Routine Routine { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
