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
public class AccountsController(IAccountsService accountsService) : ControllerBase
{
    private const string NoToday = "Today's date is required.";

    /// <summary>GET api/Finance/Accounts?today= — every account with its balance at the end of the client's today.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll(DateOnly today) =>
        today == default
            ? BadRequest(ApiResponse<List<AccountDto>>.Fail(NoToday))
            : Ok(ApiResponse<List<AccountDto>>.Ok(await accountsService.GetAllAsync(today)));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id, DateOnly today)
    {
        if (today == default)
        {
            return BadRequest(ApiResponse<AccountDto>.Fail(NoToday));
        }

        var result = await accountsService.GetAsync(id, today);
        return result.Success
            ? Ok(ApiResponse<AccountDto>.Ok(result.Data))
            : NotFound(ApiResponse<AccountDto>.Fail(result.Error!));
    }

    [HttpPost]
    public async Task<IActionResult> Create(AccountRequest request, DateOnly today) =>
        today == default
            ? BadRequest(ApiResponse<AccountDto>.Fail(NoToday))
            : Result(await accountsService.CreateAsync(request, today));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, AccountRequest request, DateOnly today) =>
        today == default
            ? BadRequest(ApiResponse<AccountDto>.Fail(NoToday))
            : Result(await accountsService.UpdateAsync(id, request, today));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await accountsService.DeleteAsync(id);
        return result.Success
            ? Ok(ApiResponse<bool>.Ok(true))
            : result.Error == "Account not found." ? NotFound(ApiResponse<bool>.Fail(result.Error)) : BadRequest(ApiResponse<bool>.Fail(result.Error!));
    }

    private IActionResult Result(OperationResult<AccountDto> result) =>
        result.Success
            ? Ok(ApiResponse<AccountDto>.Ok(result.Data))
            : BadRequest(ApiResponse<AccountDto>.Fail(result.Error!));
}
