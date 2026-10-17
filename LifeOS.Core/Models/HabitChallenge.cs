using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class HabitChallenge
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int HabitId { get; set; }

    public int Days { get; set; }

    public DateOnly StartDate { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Habit Habit { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
