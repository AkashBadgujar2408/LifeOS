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
public class RecurringTransactionsController(IRecurringTransactionsService recurringService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll() =>
        Ok(ApiResponse<List<RecurringTransactionDto>>.Ok(await recurringService.GetAllAsync()));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var result = await recurringService.GetAsync(id);
        return result.Success
            ? Ok(ApiResponse<RecurringTransactionDto>.Ok(result.Data))
            : NotFound(ApiResponse<RecurringTransactionDto>.Fail(result.Error!));
    }

    [HttpPost]
    public async Task<IActionResult> Create(RecurringTransactionRequest request) => Result(await recurringService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, RecurringTransactionRequest request) => Result(await recurringService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await recurringService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    /// <summary>POST api/Finance/RecurringTransactions/generate — writes what's due by the client's today; returns how many.</summary>
    [HttpPost("generate")]
    public async Task<IActionResult> Generate(GenerateRequest request) =>
        request.Today == default
            ? BadRequest(ApiResponse<int>.Fail("Today's date is required."))
            : Ok(ApiResponse<int>.Ok(await recurringService.GenerateDueAsync(request.Today)));

    private IActionResult Result(OperationResult<RecurringTransactionDto> result) =>
        result.Success
            ? Ok(ApiResponse<RecurringTransactionDto>.Ok(result.Data))
            : BadRequest(ApiResponse<RecurringTransactionDto>.Fail(result.Error!));
}
