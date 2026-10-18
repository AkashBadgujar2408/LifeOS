using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class SideIncomeSource
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Name { get; set; } = null!;

    public string Kind { get; set; } = null!;

    public string Status { get; set; } = null!;

    public DateOnly? StartedOn { get; set; }

    public DateOnly? EndedOn { get; set; }

    public string? Url { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public virtual ICollection<Transaction> Transactions { get; set; } = new List<Transaction>();

    public virtual User User { get; set; } = null!;
}
