using System;
using System.Collections.Generic;

namespace LifeOS.Core.Models;

public partial class Transaction
{
    public int Id { get; set; }

    public int UserId { get; set; }

    public string Kind { get; set; } = null!;

    public DateOnly OccurredOn { get; set; }

    public decimal Amount { get; set; }

    public string Currency { get; set; } = null!;

    public decimal? ExchangeRate { get; set; }

    public decimal? ToAmount { get; set; }

    public int? FromAccountId { get; set; }

    public int? ToAccountId { get; set; }

    public string? Payee { get; set; }

    public string? Note { get; set; }

    public string? Reference { get; set; }

    public int? EmploymentId { get; set; }

    public int? SideIncomeSourceId { get; set; }

    public int? LoanId { get; set; }

    public int? RecurringTransactionId { get; set; }

    public DateOnly? OccurrenceDate { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }

    public string? ImportHash { get; set; }

    public string? ToCurrency { get; set; }

    public bool IsLoanDisbursement { get; set; }

    public virtual Employment? Employment { get; set; }

    public virtual Account? FromAccount { get; set; }

    public virtual FuelLog? FuelLog { get; set; }

    public virtual Loan? Loan { get; set; }

    public virtual ICollection<MaintenanceLog> MaintenanceLogs { get; set; } = new List<MaintenanceLog>();

    public virtual RecurringTransaction? RecurringTransaction { get; set; }

    public virtual SideIncomeSource? SideIncomeSource { get; set; }

    public virtual ICollection<TaxItem> TaxItems { get; set; } = new List<TaxItem>();

    public virtual Account? ToAccount { get; set; }

    public virtual ICollection<TransactionTag> TransactionTags { get; set; } = new List<TransactionTag>();

    public virtual User User { get; set; } = null!;

    public virtual UtilityBill? UtilityBill { get; set; }
}
