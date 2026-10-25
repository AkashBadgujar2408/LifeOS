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
public class MockInterviewsController(IMockInterviewsService mockInterviewsService) : ControllerBase
{
    /// <summary>GET api/Career/MockInterviews[?applicationId=] — newest first.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll(int? applicationId) =>
        Ok(ApiResponse<List<MockInterviewDto>>.Ok(await mockInterviewsService.GetAllAsync(applicationId)));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var result = await mockInterviewsService.GetAsync(id);
        return result.Success
            ? Ok(ApiResponse<MockInterviewDto>.Ok(result.Data))
            : NotFound(ApiResponse<MockInterviewDto>.Fail(result.Error!));
    }

    [HttpPost]
    public async Task<IActionResult> Create(MockInterviewRequest request) => Result(await mockInterviewsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, MockInterviewRequest request) => Result(await mockInterviewsService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await mockInterviewsService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    private IActionResult Result(OperationResult<MockInterviewDto> result) =>
        result.Success
            ? Ok(ApiResponse<MockInterviewDto>.Ok(result.Data))
            : BadRequest(ApiResponse<MockInterviewDto>.Fail(result.Error!));
}
