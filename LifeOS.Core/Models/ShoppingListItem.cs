using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class ShoppingListItem
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int ListId { get; set; }

    public string Name { get; set; } = null!;

    public string? Quantity { get; set; }

    public decimal? EstimatedPrice { get; set; }

    public string? Currency { get; set; }

    public int SortOrder { get; set; }

    public DateTime? DoneAt { get; set; }

    public int? PurchaseId { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual ShoppingList List { get; set; } = null!;

    public virtual Purchase? Purchase { get; set; }

    public virtual User User { get; set; } = null!;
}
