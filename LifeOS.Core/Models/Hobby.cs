using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Hobby
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int? HabitId { get; set; }

    public int? LifeAreaId { get; set; }

    public string Name { get; set; } = null!;

    public string? Description { get; set; }

    public string Status { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Habit? Habit { get; set; }

    public virtual ICollection<HobbySession> HobbySessions { get; set; } = new List<HobbySession>();

    public virtual LifeArea? LifeArea { get; set; }

    public virtual User User { get; set; } = null!;
}
