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
public class SalaryRecordsController(ISalaryRecordsService salaryRecordsService) : ControllerBase
{
    /// <summary>GET api/Career/SalaryRecords — latest first, each with its change %.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll() =>
        Ok(ApiResponse<List<SalaryRecordDto>>.Ok(await salaryRecordsService.GetAllAsync()));

    [HttpPost]
    public async Task<IActionResult> Create(SalaryRecordRequest request) => Result(await salaryRecordsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, SalaryRecordRequest request) => Result(await salaryRecordsService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await salaryRecordsService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    private IActionResult Result(OperationResult<SalaryRecordDto> result) =>
        result.Success ? Ok(ApiResponse<SalaryRecordDto>.Ok(result.Data)) : BadRequest(ApiResponse<SalaryRecordDto>.Fail(result.Error!));
}
