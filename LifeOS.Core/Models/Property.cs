using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Property
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Name { get; set; } = null!;

    public string Kind { get; set; } = null!;

    public string Ownership { get; set; } = null!;

    public string? Address { get; set; }

    public DateOnly? MovedInOn { get; set; }

    public DateOnly? MovedOutOn { get; set; }

    public DateOnly? PurchasedOn { get; set; }

    public decimal? PurchasePrice { get; set; }

    public string? Currency { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual ICollection<Asset> Assets { get; set; } = new List<Asset>();

    public virtual ICollection<HouseholdProject> HouseholdProjects { get; set; } = new List<HouseholdProject>();

    public virtual ICollection<MaintenanceTask> MaintenanceTasks { get; set; } = new List<MaintenanceTask>();

    public virtual User User { get; set; } = null!;

    public virtual ICollection<UtilityBill> UtilityBills { get; set; } = new List<UtilityBill>();

    public virtual ICollection<Warranty> Warranties { get; set; } = new List<Warranty>();
}
