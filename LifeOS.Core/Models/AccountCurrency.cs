using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class AccountCurrency
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public int AccountId { get; set; }

    public string Currency { get; set; } = null!;

    public decimal OpeningBalance { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual Account Account { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
