using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class ShoppingList
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Name { get; set; } = null!;

    public bool IsArchived { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual ICollection<ShoppingListItem> ShoppingListItems { get; set; } = new List<ShoppingListItem>();

    public virtual User User { get; set; } = null!;
}
