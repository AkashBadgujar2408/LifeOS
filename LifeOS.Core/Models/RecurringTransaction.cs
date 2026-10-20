using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class RecurringTransaction
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Name { get; set; } = null!;

    public string Kind { get; set; } = null!;

    public decimal Amount { get; set; }

    public string Currency { get; set; } = null!;

    public decimal? ExchangeRate { get; set; }

    public decimal? ToAmount { get; set; }

    public int? FromAccountId { get; set; }

    public int? ToAccountId { get; set; }

    public string? Payee { get; set; }

    public string? Note { get; set; }

    public string RecurrenceFrequency { get; set; } = null!;

    public int RecurrenceInterval { get; set; }

    public DateOnly StartDate { get; set; }

    public DateOnly? Until { get; set; }

    public DateOnly? GeneratedThrough { get; set; }

    public bool IsPaused { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public string? ToCurrency { get; set; }

    public virtual Account? FromAccount { get; set; }

    public virtual ICollection<RecurringTransactionTag> RecurringTransactionTags { get; set; } = new List<RecurringTransactionTag>();

    public virtual Subscription? Subscription { get; set; }

    public virtual Account? ToAccount { get; set; }

    public virtual ICollection<Transaction> Transactions { get; set; } = new List<Transaction>();

    public virtual User User { get; set; } = null!;
}
