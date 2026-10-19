using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class WaterIntake
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public DateOnly DrunkOn { get; set; }

    public int Millilitres { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual User User { get; set; } = null!;
}
