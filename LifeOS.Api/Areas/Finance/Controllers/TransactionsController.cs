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
public class TransactionsController(ITransactionsService transactionsService, IStatementImportService importService) : ControllerBase
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

    /// <summary>POST api/Finance/Transactions/import/preview — which statement lines are new, already imported or wrong (writes nothing).</summary>
    [HttpPost("import/preview")]
    public async Task<IActionResult> PreviewImport(ImportRequest request) => ImportResult(await importService.ImportAsync(request, write: false));

    /// <summary>POST api/Finance/Transactions/import — writes the new lines (all or nothing; already imported ones are skipped).</summary>
    [HttpPost("import")]
    public async Task<IActionResult> Import(ImportRequest request) => ImportResult(await importService.ImportAsync(request, write: true));

    private IActionResult ImportResult(OperationResult<ImportResultDto> result) =>
        result.Success ? Ok(ApiResponse<ImportResultDto>.Ok(result.Data)) : BadRequest(ApiResponse<ImportResultDto>.Fail(result.Error!));

    private IActionResult Result(OperationResult<TransactionDto> result) =>
        result.Success
            ? Ok(ApiResponse<TransactionDto>.Ok(result.Data))
            : BadRequest(ApiResponse<TransactionDto>.Fail(result.Error!));
}
