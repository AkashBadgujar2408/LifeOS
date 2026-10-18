using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Finance.ServiceContracts;

/// <summary>Accounts and their balances (computed for the end of <c>asOf</c>, never stored).</summary>
public interface IAccountsService
{
    Task<List<AccountDto>> GetAllAsync(DateOnly asOf);
    Task<OperationResult<AccountDto>> GetAsync(int id, DateOnly asOf);
    Task<OperationResult<AccountDto>> CreateAsync(AccountRequest request, DateOnly asOf);
    Task<OperationResult<AccountDto>> UpdateAsync(int id, AccountRequest request, DateOnly asOf);
    Task<OperationResult<bool>> DeleteAsync(int id);
}

/// <summary>The ledger: incomes, expenses and transfers, with tags, filtered and totalled in the base currency.</summary>
public interface ITransactionsService
{
    Task<LedgerDto> GetLedgerAsync(DateOnly? from, DateOnly? to, int? accountId, int? tagId, string? kind);
    Task<OperationResult<TransactionDto>> GetAsync(int id);
    Task<OperationResult<TransactionDto>> CreateAsync(TransactionRequest request);
    Task<OperationResult<TransactionDto>> UpdateAsync(int id, TransactionRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
}

/// <summary>Repeating transactions and writing the ones that are due.</summary>
public interface IRecurringTransactionsService
{
    Task<List<RecurringTransactionDto>> GetAllAsync();
    Task<OperationResult<RecurringTransactionDto>> GetAsync(int id);
    Task<OperationResult<RecurringTransactionDto>> CreateAsync(RecurringTransactionRequest request);
    Task<OperationResult<RecurringTransactionDto>> UpdateAsync(int id, RecurringTransactionRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);

    /// <summary>Writes every occurrence due by the client's today that isn't written yet; returns how many.</summary>
    Task<int> GenerateDueAsync(DateOnly today);
}

/// <summary>Budgets per tag per month against spending.</summary>
public interface IBudgetsService
{
    Task<OperationResult<MonthSummaryDto>> GetMonthAsync(DateOnly monthStart);
    Task<List<BudgetLineDto>> OverBudgetAsync(DateOnly today);
    Task<OperationResult<MonthSummaryDto>> SetAsync(DateOnly monthStart, int tagId, decimal? amount);
    Task<OperationResult<MonthSummaryDto>> CopyPreviousAsync(DateOnly monthStart);
}

/// <summary>Investments and their hand-entered valuations.</summary>
public interface IHoldingsService
{
    Task<List<HoldingDto>> GetAllAsync(DateOnly today);
    Task<OperationResult<HoldingDto>> GetAsync(int id, DateOnly today);
    Task<OperationResult<HoldingDto>> CreateAsync(HoldingRequest request);
    Task<OperationResult<HoldingDto>> UpdateAsync(int id, HoldingRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
    Task<OperationResult<HoldingDto>> SetValuationAsync(int holdingId, HoldingValuationRequest request);
    Task<OperationResult<HoldingDto>> DeleteValuationAsync(int holdingId, int valuationId, DateOnly today);
}

/// <summary>Loans borrowed and lent, with their instalment schedules.</summary>
public interface ILoansService
{
    Task<List<LoanDto>> GetAllAsync(DateOnly today);
    Task<OperationResult<LoanDetailDto>> GetAsync(int id, DateOnly today);
    Task<OperationResult<LoanDetailDto>> CreateAsync(LoanRequest request);
    Task<OperationResult<LoanDetailDto>> UpdateAsync(int id, LoanRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
}

/// <summary>Net worth (now and month by month) and savings goals' progress.</summary>
public interface IWealthService
{
    Task<NetWorthDto> GetNetWorthAsync(DateOnly today);

    /// <summary>Null data when the goal has no amount target.</summary>
    Task<OperationResult<SavingsProgressDto?>> GetSavingsAsync(int goalId, DateOnly today);
}
