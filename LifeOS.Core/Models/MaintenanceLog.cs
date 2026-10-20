using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class MaintenanceLog
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int MaintenanceTaskId { get; set; }

    public DateOnly DoneOn { get; set; }

    public decimal? Cost { get; set; }

    public string? Currency { get; set; }

    public int? OdometerKm { get; set; }

    public int? TransactionId { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual MaintenanceTask MaintenanceTask { get; set; } = null!;

    public virtual Transaction? Transaction { get; set; }

    public virtual User User { get; set; } = null!;
}
