using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Loan
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Name { get; set; } = null!;

    public string Kind { get; set; } = null!;

    public string Direction { get; set; } = null!;

    public string? Counterparty { get; set; }

    public int? ContactId { get; set; }

    public decimal Principal { get; set; }

    public string Currency { get; set; } = null!;

    public decimal AnnualRate { get; set; }

    public int? TermMonths { get; set; }

    public DateOnly StartDate { get; set; }

    public decimal? EmiAmount { get; set; }

    public int? AccountId { get; set; }

    public DateOnly? ClosedOn { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public string RepaymentKind { get; set; } = null!;

    public DateOnly? AssumedPaidThrough { get; set; }

    public virtual Account? Account { get; set; }

    public virtual Contact? Contact { get; set; }

    public virtual ICollection<Transaction> Transactions { get; set; } = new List<Transaction>();

    public virtual User User { get; set; } = null!;
}
