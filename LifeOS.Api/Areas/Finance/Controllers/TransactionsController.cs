using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Finance.Controllers;

[ApiController]
[Area("Finance")]
[Route("api/[area]/[controller]")]
[Authorize]
public class TransactionsController(ITransactionsService transactionsService) : ControllerBase
{
    /// <summary>
    /// GET api/Finance/Transactions[?from&amp;to&amp;accountId&amp;tagId&amp;kind] — the ledger, newest first, with its
    /// totals in the base currency.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetLedger(DateOnly? from, DateOnly? to, int? accountId, int? tagId, string? kind)
    {
        if (from is { } f && to is { } t && t < f)
        {
            return BadRequest(ApiResponse<LedgerDto>.Fail("The end of the range is before its start."));
        }

        if (kind is not null && !TransactionKinds.All.Contains(kind))
        {
            return BadRequest(ApiResponse<LedgerDto>.Fail("Unknown kind of transaction."));
        }

        return Ok(ApiResponse<LedgerDto>.Ok(await transactionsService.GetLedgerAsync(from, to, accountId, tagId, kind)));
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var result = await transactionsService.GetAsync(id);
        return result.Success
            ? Ok(ApiResponse<TransactionDto>.Ok(result.Data))
            : NotFound(ApiResponse<TransactionDto>.Fail(result.Error!));
    }

    [HttpPost]
    public async Task<IActionResult> Create(TransactionRequest request) => Result(await transactionsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, TransactionRequest request) => Result(await transactionsService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await transactionsService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    private IActionResult Result(OperationResult<TransactionDto> result) =>
        result.Success
            ? Ok(ApiResponse<TransactionDto>.Ok(result.Data))
            : BadRequest(ApiResponse<TransactionDto>.Fail(result.Error!));
}
