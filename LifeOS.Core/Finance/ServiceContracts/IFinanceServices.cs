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

/// <summary>Loans borrowed and lent: EMI or pay as you go, every movement a transaction, outstanding from actual payments.</summary>
public interface ILoansService
{
    Task<List<LoanDto>> GetAllAsync(DateOnly today);
    Task<OperationResult<LoanDetailDto>> GetAsync(int id, DateOnly today);
    Task<OperationResult<LoanDetailDto>> CreateAsync(LoanRequest request);
    Task<OperationResult<LoanDetailDto>> UpdateAsync(int id, LoanRequest request);
    /// <summary>Records the money that changed hands at the start as one transaction (once).</summary>
    Task<OperationResult<LoanDetailDto>> RecordDisbursementAsync(int id, LoanMoneyRequest request, DateOnly today);
    /// <summary>Deletes the start's transaction (the loan stays).</summary>
    Task<OperationResult<LoanDetailDto>> RemoveDisbursementAsync(int id, DateOnly today);
    /// <summary>A repayment: one transaction with this loan's id.</summary>
    Task<OperationResult<LoanDetailDto>> AddPaymentAsync(int id, LoanPaymentRequest request);
    /// <summary>Deletes a repayment's transaction.</summary>
    Task<OperationResult<LoanDetailDto>> RemovePaymentAsync(int id, int transactionId, DateOnly today);
    Task<OperationResult<bool>> DeleteAsync(int id);
}

/// <summary>Net worth (now and month by month) and savings goals' progress.</summary>
public interface IWealthService
{
    Task<NetWorthDto> GetNetWorthAsync(DateOnly today);

    /// <summary>Null data when the goal has no amount target.</summary>
    Task<OperationResult<SavingsProgressDto?>> GetSavingsAsync(int goalId, DateOnly today);
}

/// <summary>The exchange-rate master (rates into the base currency, set by hand, with history).</summary>
public interface IExchangeRatesService
{
    Task<List<ExchangeRateDto>> GetAllAsync();
    Task<OperationResult<List<ExchangeRateDto>>> SetAsync(ExchangeRateRequest request);
    Task<OperationResult<List<ExchangeRateDto>>> DeleteAsync(int id);
}

/// <summary>Insurance policies and their renewal reminder (InsurancePoliciesService.SyncRenewalReminderAsync).</summary>
public interface IInsurancePoliciesService
{
    Task<List<InsurancePolicyDto>> GetAllAsync();
    Task<OperationResult<InsurancePolicyDto>> GetAsync(int id);
    Task<OperationResult<InsurancePolicyDto>> CreateAsync(InsurancePolicyRequest request);
    Task<OperationResult<InsurancePolicyDto>> UpdateAsync(int id, InsurancePolicyRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
}

/// <summary>Tax deadlines, deductions, payments and forms, by tax year.</summary>
public interface ITaxItemsService
{
    Task<List<TaxItemDto>> GetAllAsync();
    Task<OperationResult<TaxItemDto>> GetAsync(int id);
    Task<OperationResult<TaxItemDto>> CreateAsync(TaxItemRequest request);
    Task<OperationResult<TaxItemDto>> UpdateAsync(int id, TaxItemRequest request);
    Task<OperationResult<TaxItemDto>> SetDoneAsync(int id, TaxItemDoneRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
}

/// <summary>Bank statement import: checks every line, skips ones already imported, writes all or nothing.</summary>
public interface IStatementImportService
{
    /// <summary><paramref name="write"/> false = a preview (nothing written).</summary>
    Task<OperationResult<ImportResultDto>> ImportAsync(ImportRequest request, bool write);
}

/// <summary>Reports over time (the net worth trend is <see cref="IWealthService"/>).</summary>
public interface IFinanceReportsService
{
    /// <summary>The last <paramref name="months"/> months up to today's, in the base currency.</summary>
    Task<CashFlowReportDto> GetCashFlowAsync(DateOnly today, int months);
}
