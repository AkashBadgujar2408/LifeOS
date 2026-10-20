using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class WishlistItem
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Name { get; set; } = null!;

    public string? Store { get; set; }

    public string? Url { get; set; }

    public decimal? Price { get; set; }

    public decimal? TargetPrice { get; set; }

    public string? Currency { get; set; }

    public string Priority { get; set; } = null!;

    public int? PurchaseId { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Purchase? Purchase { get; set; }

    public virtual User User { get; set; } = null!;
}
