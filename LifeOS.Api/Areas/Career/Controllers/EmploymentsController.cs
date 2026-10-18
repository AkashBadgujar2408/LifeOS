using LifeOS.Core.Career.DTOs;
using LifeOS.Core.Career.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Career.Controllers;

[ApiController]
[Area("Career")]
[Route("api/[area]/[controller]")]
[Authorize]
public class EmploymentsController(IEmploymentsService employmentsService) : ControllerBase
{
    /// <summary>GET api/Career/Employments — every role, latest start first.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll() =>
        Ok(ApiResponse<List<EmploymentDto>>.Ok(await employmentsService.GetAllAsync()));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var result = await employmentsService.GetAsync(id);
        return result.Success ? Ok(ApiResponse<EmploymentDto>.Ok(result.Data)) : NotFound(ApiResponse<EmploymentDto>.Fail(result.Error!));
    }

    [HttpPost]
    public async Task<IActionResult> Create(EmploymentRequest request) => Result(await employmentsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, EmploymentRequest request) => Result(await employmentsService.UpdateAsync(id, request));

    /// <summary>POST api/Career/Employments/3/promotion { "newRole": "Senior Developer", "on": "2026-04-01", "salary": {…}, "today": … }</summary>
    [HttpPost("{id:int}/promotion")]
    public async Task<IActionResult> Promote(int id, PromotionRequest request)
    {
        var result = await employmentsService.PromoteAsync(id, request);
        return result.Success
            ? Ok(ApiResponse<PromotionResultDto>.Ok(result.Data))
            : BadRequest(ApiResponse<PromotionResultDto>.Fail(result.Error!));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await employmentsService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    private IActionResult Result(OperationResult<EmploymentDto> result) =>
        result.Success ? Ok(ApiResponse<EmploymentDto>.Ok(result.Data)) : BadRequest(ApiResponse<EmploymentDto>.Fail(result.Error!));
}
