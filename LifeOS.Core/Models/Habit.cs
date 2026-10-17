using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Habit
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int? LifeAreaId { get; set; }

    public string Title { get; set; } = null!;

    public string? Description { get; set; }

    public byte ScheduleDays { get; set; }

    public DateOnly StartDate { get; set; }

    public string Status { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public string Kind { get; set; } = null!;

    public decimal? TargetValue { get; set; }

    public string? Unit { get; set; }

    public virtual ICollection<HabitEntry> HabitEntries { get; set; } = new List<HabitEntry>();

    public virtual ICollection<HabitTag> HabitTags { get; set; } = new List<HabitTag>();

    public virtual LifeArea? LifeArea { get; set; }

    public virtual User User { get; set; } = null!;
}
