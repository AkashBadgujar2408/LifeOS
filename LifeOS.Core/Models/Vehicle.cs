using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Vehicle
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Name { get; set; } = null!;

    public string Kind { get; set; } = null!;

    public string? Make { get; set; }

    public string? Model { get; set; }

    public short? ModelYear { get; set; }

    public string? RegistrationNumber { get; set; }

    public DateOnly? PurchasedOn { get; set; }

    public decimal? PurchasePrice { get; set; }

    public string? Currency { get; set; }

    public int? InsurancePolicyId { get; set; }

    public DateOnly? PucValidUntil { get; set; }

    public int? PucReminderId { get; set; }

    public DateOnly? RegistrationValidUntil { get; set; }

    public int? RegistrationReminderId { get; set; }

    public int? ReminderDays { get; set; }

    public DateOnly? DisposedOn { get; set; }

    public string? DisposalKind { get; set; }

    public decimal? DisposalAmount { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public string FuelUnit { get; set; } = null!;

    public virtual ICollection<FuelLog> FuelLogs { get; set; } = new List<FuelLog>();

    public virtual InsurancePolicy? InsurancePolicy { get; set; }

    public virtual ICollection<MaintenanceTask> MaintenanceTasks { get; set; } = new List<MaintenanceTask>();

    public virtual Reminder? PucReminder { get; set; }

    public virtual Reminder? RegistrationReminder { get; set; }

    public virtual User User { get; set; } = null!;

    public virtual ICollection<Warranty> Warranties { get; set; } = new List<Warranty>();
}
