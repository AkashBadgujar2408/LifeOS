using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Asset
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Name { get; set; } = null!;

    public int? PropertyId { get; set; }

    public string? Room { get; set; }

    public string? Brand { get; set; }

    public string? Model { get; set; }

    public string? SerialNumber { get; set; }

    public int Quantity { get; set; }

    public DateOnly? PurchasedOn { get; set; }

    public decimal? PurchasePrice { get; set; }

    public string? Currency { get; set; }

    public DateOnly? DisposedOn { get; set; }

    public string? DisposalKind { get; set; }

    public decimal? DisposalAmount { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual ICollection<AssetTag> AssetTags { get; set; } = new List<AssetTag>();

    public virtual ICollection<MaintenanceTask> MaintenanceTasks { get; set; } = new List<MaintenanceTask>();

    public virtual Property? Property { get; set; }

    public virtual User User { get; set; } = null!;

    public virtual ICollection<Warranty> Warranties { get; set; } = new List<Warranty>();
}
