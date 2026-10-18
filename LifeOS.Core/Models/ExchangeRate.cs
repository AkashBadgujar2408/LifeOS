using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class ExchangeRate
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Currency { get; set; } = null!;

    public string BaseCurrency { get; set; } = null!;

    public decimal Rate { get; set; }

    public DateOnly EffectiveOn { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual User User { get; set; } = null!;
}
