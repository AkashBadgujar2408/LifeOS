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
public class InsurancePoliciesController(IInsurancePoliciesService policiesService) : ControllerBase
{
    /// <summary>GET api/Finance/InsurancePolicies — every policy, renewing soonest first.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll() =>
        Ok(ApiResponse<List<InsurancePolicyDto>>.Ok(await policiesService.GetAllAsync()));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var result = await policiesService.GetAsync(id);
        return result.Success
            ? Ok(ApiResponse<InsurancePolicyDto>.Ok(result.Data))
            : NotFound(ApiResponse<InsurancePolicyDto>.Fail(result.Error!));
    }

    [HttpPost]
    public async Task<IActionResult> Create(InsurancePolicyRequest request) => Result(await policiesService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, InsurancePolicyRequest request) => Result(await policiesService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await policiesService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    private IActionResult Result(OperationResult<InsurancePolicyDto> result) =>
        result.Success
            ? Ok(ApiResponse<InsurancePolicyDto>.Ok(result.Data))
            : BadRequest(ApiResponse<InsurancePolicyDto>.Fail(result.Error!));
}

[ApiController]
[Area("Finance")]
[Route("api/[area]/[controller]")]
[Authorize]
public class TaxItemsController(ITaxItemsService taxItemsService) : ControllerBase
{
    /// <summary>GET api/Finance/TaxItems — every tax item, newest tax year first, open before done.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(ApiResponse<List<TaxItemDto>>.Ok(await taxItemsService.GetAllAsync()));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var result = await taxItemsService.GetAsync(id);
        return result.Success ? Ok(ApiResponse<TaxItemDto>.Ok(result.Data)) : NotFound(ApiResponse<TaxItemDto>.Fail(result.Error!));
    }

    [HttpPost]
    public async Task<IActionResult> Create(TaxItemRequest request) => Result(await taxItemsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, TaxItemRequest request) => Result(await taxItemsService.UpdateAsync(id, request));

    /// <summary>PUT api/Finance/TaxItems/{id}/done — mark it handled on a day (null reopens it).</summary>
    [HttpPut("{id:int}/done")]
    public async Task<IActionResult> SetDone(int id, TaxItemDoneRequest request) => Result(await taxItemsService.SetDoneAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await taxItemsService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    private IActionResult Result(OperationResult<TaxItemDto> result) =>
        result.Success ? Ok(ApiResponse<TaxItemDto>.Ok(result.Data)) : BadRequest(ApiResponse<TaxItemDto>.Fail(result.Error!));
}

[ApiController]
[Area("Finance")]
[Route("api/[area]/[controller]")]
[Authorize]
public class ReportsController(IFinanceReportsService reportsService) : ControllerBase
{
    /// <summary>GET api/Finance/Reports/cashflow?today&amp;months — income, spending and savings rate by month (1–60 months).</summary>
    [HttpGet("cashflow")]
    public async Task<IActionResult> CashFlow(DateOnly today, int months = 12)
    {
        if (today == default)
        {
            return BadRequest(ApiResponse<CashFlowReportDto>.Fail("Today's date is required."));
        }

        if (months is < 1 or > 60)
        {
            return BadRequest(ApiResponse<CashFlowReportDto>.Fail("Ask for 1 to 60 months."));
        }

        return Ok(ApiResponse<CashFlowReportDto>.Ok(await reportsService.GetCashFlowAsync(today, months)));
    }
}
