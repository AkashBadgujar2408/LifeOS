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
