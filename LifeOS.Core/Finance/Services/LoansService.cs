using System.Linq.Expressions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Career.Services;
using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Finance.Services;

/// <summary>
/// Money borrowed (a liability) or lent (an asset), repaid by EMI (a fixed monthly instalment over a term) or as you
/// go. Every movement is a Finance transaction made through <see cref="ITransactionsService"/>: the money at the start
/// (one per loan, IsLoanDisbursement) and each repayment (LoanId). What's still owed is worked out by
/// <see cref="LoanLedger"/> from those actual payments on every read — never stored; an EMI loan also shows its
/// schedule and whether it's behind or ahead of it. A closed loan owes nothing from its closing day.
/// </summary>
public class LoansService(
    AppDbContext db,
    ITransactionsService transactionsService,
    IEntityLinksService entityLinksService,
    IRemindersService remindersService) : ILoansService
{
    private const string NotFound = "Loan not found.";

    public async Task<List<LoanDto>> GetAllAsync(DateOnly today)
    {
        var loans = await db.Loans.OrderBy(l => l.ClosedOn != null).ThenBy(l => l.StartDate).Select(ToDto).ToListAsync();
        var rows = (await LoanMoves.RowsAsync(db, null)).ToLookup(r => r.LoanId);
        foreach (var loan in loans)
        {
            Fill(loan, rows[loan.Id].ToList(), today);
        }

        return loans;
    }

    public async Task<OperationResult<LoanDetailDto>> GetAsync(int id, DateOnly today)
    {
        var loan = await db.Loans.Where(l => l.Id == id).Select(ToDto).FirstOrDefaultAsync();
        if (loan is null)
        {
            return OperationResult<LoanDetailDto>.Fail(NotFound);
        }

        var rows = await LoanMoves.RowsAsync(db, id);
        var (schedule, position) = Fill(loan, rows, today);
        var splits = position.Splits.ToDictionary(s => s.Id);
        return OperationResult<LoanDetailDto>.Ok(new LoanDetailDto
        {
            Loan = loan,
            Schedule = (schedule ?? []).Select(i => new LoanInstalmentDto
            {
                Number = i.Number, DueOn = i.DueOn, Payment = i.Payment, Interest = i.Interest, Principal = i.Principal, Balance = i.Balance,
            }).ToList(),
            Payments = rows
                .Where(r => !r.IsDisbursement)
                .Select(r => (Row: r, Move: r.Move(loan.Direction == LoanKinds.Lent, loan.Currency)))
                .Where(x => x.Move is not null)
                .OrderByDescending(x => x.Row.Day).ThenByDescending(x => x.Row.Id)
                .Select(x => new LoanPaymentDto
                {
                    TransactionId = x.Row.Id,
                    PaidOn = x.Row.Day,
                    Amount = -x.Move!.Value,
                    Interest = splits.GetValueOrDefault(x.Row.Id)?.Interest ?? 0,
                    Principal = splits.GetValueOrDefault(x.Row.Id)?.Principal ?? 0,
                    AccountName = x.Row.AccountName,
                    Note = x.Row.Note,
                    CoveredBySchedule = loan.AssumedPaidThrough is { } assumed && x.Row.Day <= assumed,
                })
                .ToList(),
        });
    }

    public async Task<OperationResult<LoanDetailDto>> CreateAsync(LoanRequest request)
    {
        var loan = new Loan { UserId = db.CurrentUserId!.Value };
        var error = await ApplyAsync(loan, request);
        if (error is not null)
        {
            return OperationResult<LoanDetailDto>.Fail(error);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        db.Loans.Add(loan);
        await db.SaveChangesAsync();
        if (request.Disbursement is { } money)
        {
            var moneyError = await RecordStartAsync(loan, money, request.Today);
            if (moneyError is not null)
            {
                return OperationResult<LoanDetailDto>.Fail(moneyError);
            }
        }

        await transaction.CommitAsync();
        return await GetAsync(loan.Id, request.Today);
    }

    public async Task<OperationResult<LoanDetailDto>> UpdateAsync(int id, LoanRequest request)
    {
        var loan = await db.Loans.FindAsync(id);
        if (loan is null)
        {
            return OperationResult<LoanDetailDto>.Fail(NotFound);
        }

        var before = (loan.Principal, loan.Currency, loan.StartDate, loan.Direction);
        var error = await ApplyAsync(loan, request);
        if (error is not null)
        {
            return OperationResult<LoanDetailDto>.Fail(error);
        }

        // The ledger already holds the money at the start; changing it here would make the two disagree.
        if (before != (loan.Principal, loan.Currency, loan.StartDate, loan.Direction)
            && await db.Transactions.AnyAsync(t => t.LoanId == id && t.IsLoanDisbursement))
        {
            return OperationResult<LoanDetailDto>.Fail(
                "The start is recorded in Finance — take it back first to change the amount, currency, start day or direction.");
        }

        // Payments in another currency would silently stop counting.
        if (before.Currency != loan.Currency && await db.Transactions.AnyAsync(t => t.LoanId == id))
        {
            return OperationResult<LoanDetailDto>.Fail("It has payments in Finance — its currency can't change.");
        }

        loan.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id, request.Today);
    }

    public async Task<OperationResult<LoanDetailDto>> RecordDisbursementAsync(int id, LoanMoneyRequest request, DateOnly today)
    {
        var loan = await db.Loans.FindAsync(id);
        if (loan is null)
        {
            return OperationResult<LoanDetailDto>.Fail(NotFound);
        }

        if (today == default)
        {
            return OperationResult<LoanDetailDto>.Fail("Today's date is required.");
        }

        if (await db.Transactions.AnyAsync(t => t.LoanId == id && t.IsLoanDisbursement))
        {
            return OperationResult<LoanDetailDto>.Fail("The start is in Finance already.");
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        var error = await RecordStartAsync(loan, request, today);
        if (error is not null)
        {
            return OperationResult<LoanDetailDto>.Fail(error);
        }

        await transaction.CommitAsync();
        return await GetAsync(id, today);
    }

    public async Task<OperationResult<LoanDetailDto>> RemoveDisbursementAsync(int id, DateOnly today)
    {
        if (!await db.Loans.AnyAsync(l => l.Id == id))
        {
            return OperationResult<LoanDetailDto>.Fail(NotFound);
        }

        var transactionId = await db.Transactions.Where(t => t.LoanId == id && t.IsLoanDisbursement).Select(t => (int?)t.Id).FirstOrDefaultAsync();
        if (transactionId is { } tid)
        {
            var deleted = await transactionsService.DeleteAsync(tid);
            if (!deleted.Success)
            {
                return OperationResult<LoanDetailDto>.Fail(deleted.Error!);
            }
        }

        return await GetAsync(id, today);
    }

    public async Task<OperationResult<LoanDetailDto>> AddPaymentAsync(int id, LoanPaymentRequest request)
    {
        var loan = await db.Loans.Include(l => l.Contact).FirstOrDefaultAsync(l => l.Id == id);
        if (loan is null)
        {
            return OperationResult<LoanDetailDto>.Fail(NotFound);
        }

        var error = WealthRules.CheckLoanPayment(request.PaidOn, request.Amount, loan.StartDate, loan.ClosedOn, request.Today);
        if (error is not null)
        {
            return OperationResult<LoanDetailDto>.Fail(error);
        }

        var isLent = loan.Direction == LoanKinds.Lent;
        await using var transaction = await db.Database.BeginTransactionAsync();
        var created = await transactionsService.CreateAsync(new TransactionRequest
        {
            // Paying back a loan you took is money out; being paid back on one you gave is money in.
            Kind = isLent ? TransactionKinds.Income : TransactionKinds.Expense,
            OccurredOn = request.PaidOn,
            Amount = request.Amount,
            Currency = loan.Currency,
            ExchangeRate = request.ExchangeRate,
            FromAccountId = isLent ? null : request.AccountId,
            ToAccountId = isLent ? request.AccountId : null,
            Payee = Payee(loan),
            Note = string.IsNullOrWhiteSpace(request.Note) ? $"{loan.Name} — repayment" : request.Note.Trim(),
            TagIds = request.TagIds,
        });
        if (!created.Success)
        {
            return OperationResult<LoanDetailDto>.Fail(created.Error!);
        }

        await db.Transactions.Where(t => t.Id == created.Data!.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.LoanId, id));
        await transaction.CommitAsync();
        return await GetAsync(id, request.Today);
    }

    public async Task<OperationResult<LoanDetailDto>> RemovePaymentAsync(int id, int transactionId, DateOnly today)
    {
        if (!await db.Transactions.AnyAsync(t => t.Id == transactionId && t.LoanId == id && !t.IsLoanDisbursement))
        {
            return OperationResult<LoanDetailDto>.Fail("Payment not found.");
        }

        var deleted = await transactionsService.DeleteAsync(transactionId);
        return deleted.Success ? await GetAsync(id, today) : OperationResult<LoanDetailDto>.Fail(deleted.Error!);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var loan = await db.Loans.FindAsync(id);
        if (loan is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        // Money that moved stays in the ledger, just no longer tied to a loan.
        await db.Transactions.Where(t => t.LoanId == id)
            .ExecuteUpdateAsync(s => s
                .SetProperty(t => t.LoanId, (int?)null)
                .SetProperty(t => t.IsLoanDisbursement, false)
                .SetProperty(t => t.UpdatedAt, now));
        loan.IsDeleted = true;
        loan.DeletedAt = now;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(LoanLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(LoanLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<string?> ApplyAsync(Loan loan, LoanRequest request)
    {
        var name = request.Name.Trim();
        if (name.Length == 0)
        {
            return "Name it (e.g. Home loan).";
        }

        if (request.Today == default)
        {
            return "Today's date is required.";
        }

        var currency = CareerRules.Currency(request.Currency);
        var error = WealthRules.CheckLoan(
            request.Kind, request.Direction, currency, request.Principal, request.AnnualRate, request.RepaymentKind,
            request.TermMonths, request.StartDate, request.EmiAmount, request.AssumedPaidThrough, request.ClosedOn, request.Today);
        if (error is not null)
        {
            return error;
        }

        if (request.AccountId is { } accountId && !await db.Accounts.AnyAsync(a => a.Id == accountId))
        {
            return "Account not found.";
        }

        if (request.ContactId is { } contactId && !await db.Contacts.AnyAsync(c => c.Id == contactId))
        {
            return "Contact not found.";
        }

        loan.Name = name;
        loan.Kind = request.Kind;
        loan.Direction = request.Direction;
        loan.Counterparty = string.IsNullOrWhiteSpace(request.Counterparty) ? null : request.Counterparty.Trim();
        loan.ContactId = request.ContactId;
        loan.Principal = request.Principal;
        loan.Currency = currency!;
        loan.AnnualRate = request.AnnualRate;
        loan.RepaymentKind = request.RepaymentKind;
        var emi = request.RepaymentKind == LoanLedger.Emi;
        loan.TermMonths = emi ? request.TermMonths : null;
        loan.EmiAmount = emi ? request.EmiAmount : null;
        loan.AssumedPaidThrough = emi ? request.AssumedPaidThrough : null;
        loan.StartDate = request.StartDate;
        loan.AccountId = request.AccountId;
        loan.ClosedOn = request.ClosedOn;
        loan.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        return null;
    }

    /// <summary>One transaction for the money at the start: borrowed = in to the account, lent = out of it.</summary>
    private async Task<string?> RecordStartAsync(Loan loan, LoanMoneyRequest request, DateOnly today)
    {
        if (loan.StartDate > today)
        {
            return "It starts in the future — record the money once it has changed hands.";
        }

        if (loan.Contact is null && loan.ContactId is not null)
        {
            await db.Entry(loan).Reference(l => l.Contact).LoadAsync();
        }

        var isLent = loan.Direction == LoanKinds.Lent;
        var created = await transactionsService.CreateAsync(new TransactionRequest
        {
            Kind = isLent ? TransactionKinds.Expense : TransactionKinds.Income,
            OccurredOn = loan.StartDate,
            Amount = loan.Principal,
            Currency = loan.Currency,
            ExchangeRate = request.ExchangeRate,
            FromAccountId = isLent ? request.AccountId : null,
            ToAccountId = isLent ? null : request.AccountId,
            Payee = Payee(loan),
            Note = isLent ? $"{loan.Name} — lent" : $"{loan.Name} — received",
            TagIds = request.TagIds,
        });
        if (!created.Success)
        {
            return created.Error!;
        }

        try
        {
            await db.Transactions.Where(t => t.Id == created.Data!.Id)
                .ExecuteUpdateAsync(s => s.SetProperty(t => t.LoanId, loan.Id).SetProperty(t => t.IsLoanDisbursement, true));
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return "The start was recorded somewhere else at the same time. Reload.";
        }

        return null;
    }

    /// <summary>Who the money went to / came from: the contact, the lender's name, else the loan.</summary>
    private static string Payee(Loan loan) => loan.Contact?.Name ?? loan.Counterparty ?? loan.Name;

    private static (List<LoanInstalment>? Schedule, LoanPosition Position) Fill(LoanDto loan, List<LoanMoveRow> rows, DateOnly today)
    {
        var isLent = loan.Direction == LoanKinds.Lent;
        var moves = rows.Select(r => r.Move(isLent, loan.Currency) is { } amount ? new LoanMove(r.Id, r.Day, amount) : null)
            .OfType<LoanMove>().ToList();
        var wealth = new WealthLoan(loan.Id, loan.Name, isLent, loan.Currency, loan.Principal, loan.AnnualRate, loan.TermMonths,
            loan.StartDate, loan.EmiAmount, loan.ClosedOn, loan.AssumedPaidThrough, moves);
        var schedule = wealth.Schedule();
        var position = wealth.PositionAt(today);
        var start = rows.FirstOrDefault(r => r.IsDisbursement);
        loan.DisbursementTransactionId = start?.Id;
        loan.DisbursementAccountName = start?.AccountName;
        loan.Outstanding = position.Outstanding;
        loan.InterestDue = position.InterestDue;
        loan.InterestCharged = position.InterestCharged;
        var counted = moves.Where(m => m.Amount < 0 && (loan.AssumedPaidThrough is not { } a || m.Day > a)).ToList();
        loan.PaymentCount = counted.Count;
        loan.LastPaidOn = counted.Count > 0 ? counted.Max(m => m.Day) : null;
        loan.Repaid = position.Repaid;
        if (schedule is not null)
        {
            loan.Emi = loan.EmiAmount ?? LoanSchedule.Emi(loan.Principal, loan.AnnualRate, loan.TermMonths!.Value);
            loan.ScheduledOutstanding = LoanSchedule.OutstandingOn(schedule, loan.Principal, loan.StartDate, loan.ClosedOn, today);
            loan.Behind = position.Outstanding - loan.ScheduledOutstanding;
            loan.InstalmentCount = schedule.Count;
            loan.InstalmentsDue = schedule.Count(i => i.DueOn <= today);
            loan.NextDueOn = loan.ClosedOn is not null ? null : schedule.FirstOrDefault(i => i.DueOn > today)?.DueOn;
            loan.LastDueOn = schedule.LastOrDefault()?.DueOn;
            loan.TotalInterest = schedule.Sum(i => i.Interest);
            // Instalments taken as paid count as repaid too.
            if (loan.AssumedPaidThrough is { } assumed)
            {
                loan.Repaid += schedule.Where(i => i.DueOn <= assumed && i.DueOn <= today).Sum(i => i.Payment);
            }
        }

        return (schedule, position);
    }

    private static readonly Expression<Func<Loan, LoanDto>> ToDto = l => new LoanDto
    {
        Id = l.Id,
        Name = l.Name,
        Kind = l.Kind,
        Direction = l.Direction,
        Counterparty = l.Counterparty,
        ContactId = l.ContactId,
        ContactName = l.Contact != null ? l.Contact.Name : null,
        Principal = l.Principal,
        Currency = l.Currency,
        AnnualRate = l.AnnualRate,
        TermMonths = l.TermMonths,
        StartDate = l.StartDate,
        EmiAmount = l.EmiAmount,
        AccountId = l.AccountId,
        AccountName = l.Account != null ? l.Account.Name : null,
        ClosedOn = l.ClosedOn,
        Notes = l.Notes,
        RepaymentKind = l.RepaymentKind,
        AssumedPaidThrough = l.AssumedPaidThrough,
    };
}

/// <summary>A transaction tied to a loan, as the loan reads it.</summary>
public sealed record LoanMoveRow(
    int Id, int LoanId, DateOnly Day, string Kind, bool IsDisbursement, decimal Amount, string Currency,
    decimal? ToAmount, string? ToCurrency, string? AccountName, string? Note)
{
    public decimal? Move(bool isLent, string loanCurrency) =>
        LoanLedger.MoveOf(isLent, Kind, IsDisbursement, Amount, Currency, ToAmount, ToCurrency, loanCurrency);
}

/// <summary>Loads the transactions tied to loans (shared by the loans pages and net worth).</summary>
public static class LoanMoves
{
    public static async Task<List<LoanMoveRow>> RowsAsync(AppDbContext db, int? loanId) =>
        await db.Transactions
            .Where(t => t.LoanId != null && (loanId == null || t.LoanId == loanId))
            .Select(t => new LoanMoveRow(
                t.Id, t.LoanId!.Value, t.OccurredOn, t.Kind, t.IsLoanDisbursement, t.Amount, t.Currency, t.ToAmount, t.ToCurrency,
                t.FromAccount != null ? t.FromAccount.Name : t.ToAccount != null ? t.ToAccount.Name : null, t.Note))
            .ToListAsync();

    /// <summary>Every loan's moves in its own currency, by loan id.</summary>
    public static async Task<Dictionary<int, List<LoanMove>>> LoadAsync(AppDbContext db)
    {
        var loans = await db.Loans.Select(l => new { l.Id, l.Direction, l.Currency }).ToDictionaryAsync(l => l.Id);
        return (await RowsAsync(db, null))
            .Where(r => loans.ContainsKey(r.LoanId))
            .GroupBy(r => r.LoanId)
            .ToDictionary(
                g => g.Key,
                g => g.Select(r => r.Move(loans[g.Key].Direction == LoanKinds.Lent, loans[g.Key].Currency) is { } amount
                        ? new LoanMove(r.Id, r.Day, amount)
                        : null)
                    .OfType<LoanMove>()
                    .ToList());
    }
}

/// <summary>Loans can be linked, have reminders and be found by search (name or who it's with).</summary>
public class LoanLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = NetWorth.LoanType;

    public string EntityType => Type;

    public string DisplayName => "Loan";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.Loans.Where(l => ids.Contains(l.Id)).ToDictionaryAsync(l => l.Id, l => l.Name);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Loans.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(l => l.Name.Contains(search) || (l.Counterparty != null && l.Counterparty.Contains(search)));
        }

        return await query
            .OrderBy(l => l.ClosedOn != null).ThenBy(l => l.Name)
            .Take(take)
            .Select(l => new LinkableItemDto { EntityType = Type, EntityId = l.Id, Title = l.Name })
            .ToListAsync();
    }
}
