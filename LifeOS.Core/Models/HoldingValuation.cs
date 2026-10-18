using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class HoldingValuation
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int HoldingId { get; set; }

    public DateOnly ValuedOn { get; set; }

    public decimal Value { get; set; }

    public string? Note { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Holding Holding { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
