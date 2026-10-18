using LifeOS.Core.Learning.DTOs;
using LifeOS.Core.Learning.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Learning.Controllers;

[ApiController]
[Area("Learning")]
[Route("api/[area]/[controller]")]
[Authorize]
public class CertificationsController(ICertificationsService certificationsService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll() =>
        Ok(ApiResponse<List<CertificationDto>>.Ok(await certificationsService.GetAllAsync()));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var result = await certificationsService.GetAsync(id);
        return result.Success ? Ok(ApiResponse<CertificationDto>.Ok(result.Data)) : NotFound(ApiResponse<CertificationDto>.Fail(result.Error!));
    }

    [HttpPost]
    public async Task<IActionResult> Create(CertificationRequest request) => Result(await certificationsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, CertificationRequest request) => Result(await certificationsService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await certificationsService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    private IActionResult Result(OperationResult<CertificationDto> result) =>
        result.Success ? Ok(ApiResponse<CertificationDto>.Ok(result.Data)) : BadRequest(ApiResponse<CertificationDto>.Fail(result.Error!));
}
