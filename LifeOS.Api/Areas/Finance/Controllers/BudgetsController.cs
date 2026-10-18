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
public class BudgetsController(IBudgetsService budgetsService) : ControllerBase
{
    /// <summary>GET api/Finance/Budgets/{month's first day} — budgets per tag against spending, and the month's totals.</summary>
    [HttpGet("{month}")]
    public async Task<IActionResult> GetMonth(DateOnly month) => Result(await budgetsService.GetMonthAsync(month));

    /// <summary>PUT api/Finance/Budgets/{month}/{tagId} — sets the tag's budget for the month (null amount removes it).</summary>
    [HttpPut("{month}/{tagId:int}")]
    public async Task<IActionResult> Set(DateOnly month, int tagId, BudgetRequest request) =>
        Result(await budgetsService.SetAsync(month, tagId, request.Amount));

    /// <summary>POST api/Finance/Budgets/{month}/copy — copies last month's budgets into tags not budgeted yet.</summary>
    [HttpPost("{month}/copy")]
    public async Task<IActionResult> CopyPrevious(DateOnly month) => Result(await budgetsService.CopyPreviousAsync(month));

    private IActionResult Result(OperationResult<MonthSummaryDto> result) =>
        result.Success
            ? Ok(ApiResponse<MonthSummaryDto>.Ok(result.Data))
            : BadRequest(ApiResponse<MonthSummaryDto>.Fail(result.Error!));
}
