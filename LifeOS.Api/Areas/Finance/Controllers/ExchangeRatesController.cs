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
public class ExchangeRatesController(IExchangeRatesService ratesService) : ControllerBase
{
    /// <summary>GET api/Finance/ExchangeRates — the rates set against the current base currency, newest first per currency.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(ApiResponse<List<ExchangeRateDto>>.Ok(await ratesService.GetAllAsync()));

    /// <summary>PUT api/Finance/ExchangeRates — a currency's rate from a day (that day's rate is replaced).</summary>
    [HttpPut]
    public async Task<IActionResult> Set(ExchangeRateRequest request) => Result(await ratesService.SetAsync(request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await ratesService.DeleteAsync(id);
        return result.Success
            ? Ok(ApiResponse<List<ExchangeRateDto>>.Ok(result.Data))
            : NotFound(ApiResponse<List<ExchangeRateDto>>.Fail(result.Error!));
    }

    private IActionResult Result(OperationResult<List<ExchangeRateDto>> result) =>
        result.Success
            ? Ok(ApiResponse<List<ExchangeRateDto>>.Ok(result.Data))
            : BadRequest(ApiResponse<List<ExchangeRateDto>>.Fail(result.Error!));
}
