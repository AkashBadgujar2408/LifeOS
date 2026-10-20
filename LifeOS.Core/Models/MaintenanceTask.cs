using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class MaintenanceTask
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Title { get; set; } = null!;

    public int? AssetId { get; set; }

    public int? VehicleId { get; set; }

    public int? PropertyId { get; set; }

    public string RecurrenceFrequency { get; set; } = null!;

    public int RecurrenceInterval { get; set; }

    public DateOnly FirstDueOn { get; set; }

    public bool IsPaused { get; set; }

    public int? ContactId { get; set; }

    public int? ReminderDays { get; set; }

    public int? ReminderId { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Asset? Asset { get; set; }

    public virtual Contact? Contact { get; set; }

    public virtual ICollection<MaintenanceLog> MaintenanceLogs { get; set; } = new List<MaintenanceLog>();

    public virtual Property? Property { get; set; }

    public virtual Reminder? Reminder { get; set; }

    public virtual User User { get; set; } = null!;

    public virtual Vehicle? Vehicle { get; set; }
}
