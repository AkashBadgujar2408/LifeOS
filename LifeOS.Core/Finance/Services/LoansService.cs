using System.Linq.Expressions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Career.Services;
using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Finance.Services;

/// <summary>
/// Money borrowed (a liability) or lent (an asset). The instalment schedule and what's still owed are worked out by
/// <see cref="LoanSchedule"/> on every read (assuming each instalment due was paid) — never stored. A closed loan
/// owes nothing from its closing day.
/// </summary>
public class LoansService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService)
    : ILoansService
{
    private const string NotFound = "Loan not found.";

    public async Task<List<LoanDto>> GetAllAsync(DateOnly today)
    {
        var loans = await db.Loans.OrderBy(l => l.ClosedOn != null).ThenBy(l => l.StartDate).Select(ToDto).ToListAsync();
        loans.ForEach(l => Fill(l, today));
        return loans;
    }

    public async Task<OperationResult<LoanDetailDto>> GetAsync(int id, DateOnly today)
    {
        var loan = await db.Loans.Where(l => l.Id == id).Select(ToDto).FirstOrDefaultAsync();
        if (loan is null)
        {
            return OperationResult<LoanDetailDto>.Fail(NotFound);
        }

        var schedule = Fill(loan, today);
        return OperationResult<LoanDetailDto>.Ok(new LoanDetailDto
        {
            Loan = loan,
            Schedule = schedule.Select(i => new LoanInstalmentDto
            {
                Number = i.Number, DueOn = i.DueOn, Payment = i.Payment, Interest = i.Interest, Principal = i.Principal, Balance = i.Balance,
            }).ToList(),
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

        db.Loans.Add(loan);
        await db.SaveChangesAsync();
        return await GetAsync(loan.Id, request.Today);
    }

    public async Task<OperationResult<LoanDetailDto>> UpdateAsync(int id, LoanRequest request)
    {
        var loan = await db.Loans.FindAsync(id);
        if (loan is null)
        {
            return OperationResult<LoanDetailDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(loan, request);
        if (error is not null)
        {
            return OperationResult<LoanDetailDto>.Fail(error);
        }

        loan.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id, request.Today);
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
        // Payments made keep their money, just not which loan they were for.
        await db.Transactions.Where(t => t.LoanId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.LoanId, (int?)null).SetProperty(t => t.UpdatedAt, now));
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
            request.Kind, request.Direction, currency, request.Principal, request.AnnualRate, request.TermMonths,
            request.StartDate, request.EmiAmount, request.ClosedOn, request.Today);
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
        loan.TermMonths = request.TermMonths;
        loan.StartDate = request.StartDate;
        loan.EmiAmount = request.EmiAmount;
        loan.AccountId = request.AccountId;
        loan.ClosedOn = request.ClosedOn;
        loan.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        return null;
    }

    private static List<LoanInstalment> Fill(LoanDto loan, DateOnly today)
    {
        var schedule = LoanSchedule.Build(loan.Principal, loan.AnnualRate, loan.TermMonths, loan.StartDate, loan.EmiAmount);
        loan.Emi = loan.EmiAmount ?? LoanSchedule.Emi(loan.Principal, loan.AnnualRate, loan.TermMonths);
        loan.Outstanding = LoanSchedule.OutstandingOn(schedule, loan.Principal, loan.StartDate, loan.ClosedOn, today);
        loan.InstalmentCount = schedule.Count;
        loan.InstalmentsPaid = schedule.Count(i => i.DueOn <= today);
        loan.NextDueOn = loan.ClosedOn is not null ? null : schedule.FirstOrDefault(i => i.DueOn > today)?.DueOn;
        loan.LastDueOn = schedule.LastOrDefault()?.DueOn;
        loan.TotalInterest = schedule.Sum(i => i.Interest);
        return schedule;
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
    };
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
