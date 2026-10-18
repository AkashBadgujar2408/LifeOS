using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Holding
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Name { get; set; } = null!;

    public string Kind { get; set; } = null!;

    public string Currency { get; set; } = null!;

    public decimal? Units { get; set; }

    public decimal? InvestedAmount { get; set; }

    public decimal? InterestRate { get; set; }

    public DateOnly? AcquiredOn { get; set; }

    public DateOnly? MaturesOn { get; set; }

    public DateOnly? DisposedOn { get; set; }

    public int? AccountId { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Account? Account { get; set; }

    public virtual ICollection<HoldingValuation> HoldingValuations { get; set; } = new List<HoldingValuation>();

    public virtual User User { get; set; } = null!;
}
