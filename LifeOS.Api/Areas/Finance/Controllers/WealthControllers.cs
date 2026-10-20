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
public class HoldingsController(IHoldingsService holdingsService) : ControllerBase
{
    private const string NoToday = "Today's date is required.";

    /// <summary>GET api/Finance/Holdings?today= — every investment with what it's worth today.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll(DateOnly today) =>
        today == default
            ? BadRequest(ApiResponse<List<HoldingDto>>.Fail(NoToday))
            : Ok(ApiResponse<List<HoldingDto>>.Ok(await holdingsService.GetAllAsync(today)));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id, DateOnly today)
    {
        if (today == default)
        {
            return BadRequest(ApiResponse<HoldingDto>.Fail(NoToday));
        }

        var result = await holdingsService.GetAsync(id, today);
        return result.Success ? Ok(ApiResponse<HoldingDto>.Ok(result.Data)) : NotFound(ApiResponse<HoldingDto>.Fail(result.Error!));
    }

    [HttpPost]
    public async Task<IActionResult> Create(HoldingRequest request) => Result(await holdingsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, HoldingRequest request) => Result(await holdingsService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await holdingsService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    /// <summary>PUT api/Finance/Holdings/{id}/valuations — what it was worth on a day (replaces that day's).</summary>
    [HttpPut("{id:int}/valuations")]
    public async Task<IActionResult> SetValuation(int id, HoldingValuationRequest request) =>
        Result(await holdingsService.SetValuationAsync(id, request));

    [HttpDelete("{id:int}/valuations/{valuationId:int}")]
    public async Task<IActionResult> DeleteValuation(int id, int valuationId, DateOnly today) =>
        today == default
            ? BadRequest(ApiResponse<HoldingDto>.Fail(NoToday))
            : Result(await holdingsService.DeleteValuationAsync(id, valuationId, today));

    private IActionResult Result(OperationResult<HoldingDto> result) =>
        result.Success ? Ok(ApiResponse<HoldingDto>.Ok(result.Data)) : BadRequest(ApiResponse<HoldingDto>.Fail(result.Error!));
}

[ApiController]
[Area("Finance")]
[Route("api/[area]/[controller]")]
[Authorize]
public class LoansController(ILoansService loansService) : ControllerBase
{
    private const string NoToday = "Today's date is required.";

    /// <summary>GET api/Finance/Loans?today= — every loan with its instalment and what's still owed today.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll(DateOnly today) =>
        today == default
            ? BadRequest(ApiResponse<List<LoanDto>>.Fail(NoToday))
            : Ok(ApiResponse<List<LoanDto>>.Ok(await loansService.GetAllAsync(today)));

    /// <summary>GET api/Finance/Loans/{id}?today= — the loan and its full instalment schedule.</summary>
    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id, DateOnly today)
    {
        if (today == default)
        {
            return BadRequest(ApiResponse<LoanDetailDto>.Fail(NoToday));
        }

        var result = await loansService.GetAsync(id, today);
        return result.Success ? Ok(ApiResponse<LoanDetailDto>.Ok(result.Data)) : NotFound(ApiResponse<LoanDetailDto>.Fail(result.Error!));
    }

    [HttpPost]
    public async Task<IActionResult> Create(LoanRequest request) => Result(await loansService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, LoanRequest request) => Result(await loansService.UpdateAsync(id, request));

    /// <summary>PUT api/Finance/Loans/{id}/disbursement?today= — record the money at the start as one transaction (once).</summary>
    [HttpPut("{id:int}/disbursement")]
    public async Task<IActionResult> RecordDisbursement(int id, LoanMoneyRequest request, DateOnly today) =>
        Result(await loansService.RecordDisbursementAsync(id, request, today));

    /// <summary>DELETE api/Finance/Loans/{id}/disbursement?today= — take the start's transaction back.</summary>
    [HttpDelete("{id:int}/disbursement")]
    public async Task<IActionResult> RemoveDisbursement(int id, DateOnly today) =>
        Result(await loansService.RemoveDisbursementAsync(id, today));

    /// <summary>POST api/Finance/Loans/{id}/payments — a repayment, as one transaction tied to the loan.</summary>
    [HttpPost("{id:int}/payments")]
    public async Task<IActionResult> AddPayment(int id, LoanPaymentRequest request) => Result(await loansService.AddPaymentAsync(id, request));

    /// <summary>DELETE api/Finance/Loans/{id}/payments/{transactionId}?today= — delete a repayment's transaction.</summary>
    [HttpDelete("{id:int}/payments/{transactionId:int}")]
    public async Task<IActionResult> RemovePayment(int id, int transactionId, DateOnly today) =>
        Result(await loansService.RemovePaymentAsync(id, transactionId, today));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await loansService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    private IActionResult Result(OperationResult<LoanDetailDto> result) =>
        result.Success ? Ok(ApiResponse<LoanDetailDto>.Ok(result.Data)) : BadRequest(ApiResponse<LoanDetailDto>.Fail(result.Error!));
}

[ApiController]
[Area("Finance")]
[Route("api/[area]/[controller]")]
[Authorize]
public class NetWorthController(IWealthService wealthService) : ControllerBase
{
    /// <summary>GET api/Finance/NetWorth?today= — assets, liabilities and net worth today, and at each of the last 12 month ends.</summary>
    [HttpGet]
    public async Task<IActionResult> Get(DateOnly today) =>
        today == default
            ? BadRequest(ApiResponse<NetWorthDto>.Fail("Today's date is required."))
            : Ok(ApiResponse<NetWorthDto>.Ok(await wealthService.GetNetWorthAsync(today)));

    /// <summary>GET api/Finance/NetWorth/savings/{goalId}?today= — a savings goal's progress (data null: no amount target).</summary>
    [HttpGet("savings/{goalId:int}")]
    public async Task<IActionResult> Savings(int goalId, DateOnly today)
    {
        if (today == default)
        {
            return BadRequest(ApiResponse<SavingsProgressDto?>.Fail("Today's date is required."));
        }

        var result = await wealthService.GetSavingsAsync(goalId, today);
        return result.Success
            ? Ok(ApiResponse<SavingsProgressDto?>.Ok(result.Data))
            : NotFound(ApiResponse<SavingsProgressDto?>.Fail(result.Error!));
    }
}
