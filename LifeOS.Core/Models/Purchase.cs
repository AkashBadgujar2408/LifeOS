using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Purchase
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Title { get; set; } = null!;

    public string? Store { get; set; }

    public DateOnly PurchasedOn { get; set; }

    public decimal Amount { get; set; }

    public decimal? EstimatedAmount { get; set; }

    public string Currency { get; set; } = null!;

    public int? TransactionId { get; set; }

    public int? AssetId { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Asset? Asset { get; set; }

    public virtual ICollection<BenefitRedemption> BenefitRedemptions { get; set; } = new List<BenefitRedemption>();

    public virtual ICollection<Benefit> Benefits { get; set; } = new List<Benefit>();

    public virtual ICollection<PointBatch> PointBatches { get; set; } = new List<PointBatch>();

    public virtual ICollection<PurchaseTag> PurchaseTags { get; set; } = new List<PurchaseTag>();

    public virtual ICollection<Return> Returns { get; set; } = new List<Return>();

    public virtual ICollection<ShoppingListItem> ShoppingListItems { get; set; } = new List<ShoppingListItem>();

    public virtual Transaction? Transaction { get; set; }

    public virtual User User { get; set; } = null!;

    public virtual ICollection<WishlistItem> WishlistItems { get; set; } = new List<WishlistItem>();
}
