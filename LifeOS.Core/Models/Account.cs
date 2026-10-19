using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Account
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Name { get; set; } = null!;

    public string Kind { get; set; } = null!;

    public string? Institution { get; set; }

    public string? NumberLast4 { get; set; }

    public string Currency { get; set; } = null!;

    public decimal OpeningBalance { get; set; }

    public DateOnly OpeningDate { get; set; }

    public bool IsArchived { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public Guid ImportKey { get; set; }

    public virtual ICollection<Holding> Holdings { get; set; } = new List<Holding>();

    public virtual ICollection<Loan> Loans { get; set; } = new List<Loan>();

    public virtual ICollection<RecurringTransaction> RecurringTransactionFromAccounts { get; set; } = new List<RecurringTransaction>();

    public virtual ICollection<RecurringTransaction> RecurringTransactionToAccounts { get; set; } = new List<RecurringTransaction>();

    public virtual ICollection<Transaction> TransactionFromAccounts { get; set; } = new List<Transaction>();

    public virtual ICollection<Transaction> TransactionToAccounts { get; set; } = new List<Transaction>();

    public virtual User User { get; set; } = null!;
}
