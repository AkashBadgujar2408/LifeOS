using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class FuelLog
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int VehicleId { get; set; }

    public DateOnly FilledOn { get; set; }

    public int OdometerKm { get; set; }

    public decimal Amount { get; set; }

    public string Currency { get; set; } = null!;

    public decimal? PricePerUnit { get; set; }

    public decimal? Quantity { get; set; }

    public bool MissedFillBefore { get; set; }

    public int? TransactionId { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Transaction? Transaction { get; set; }

    public virtual User User { get; set; } = null!;

    public virtual Vehicle Vehicle { get; set; } = null!;
}
