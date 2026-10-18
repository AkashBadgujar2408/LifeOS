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
public class JobApplicationsController(IJobApplicationsService applicationsService, IInterviewsService interviewsService)
    : ControllerBase
{
    /// <summary>GET api/Career/JobApplications[?contactId=] — most recently changed first.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll(int? contactId) =>
        Ok(ApiResponse<List<JobApplicationDto>>.Ok(await applicationsService.GetAllAsync(contactId)));

    /// <summary>GET api/Career/JobApplications/{id} — with its stage history and interview rounds.</summary>
    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var result = await applicationsService.GetAsync(id);
        return result.Success
            ? Ok(ApiResponse<JobApplicationDetailDto>.Ok(result.Data))
            : NotFound(ApiResponse<JobApplicationDetailDto>.Fail(result.Error!));
    }

    [HttpPost]
    public async Task<IActionResult> Create(JobApplicationRequest request) => Result(await applicationsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, JobApplicationRequest request) => Result(await applicationsService.UpdateAsync(id, request));

    /// <summary>PUT api/Career/JobApplications/{id}/stage — move it (logged); to Interview can schedule a round.</summary>
    [HttpPut("{id:int}/stage")]
    public async Task<IActionResult> Move(int id, ApplicationStageRequest request) => Result(await applicationsService.MoveAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await applicationsService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    /// <summary>POST api/Career/JobApplications/{id}/interviews — a round; with times it goes on the calendar.</summary>
    [HttpPost("{id:int}/interviews")]
    public async Task<IActionResult> AddInterview(int id, InterviewRequest request) =>
        InterviewResult(await interviewsService.CreateAsync(id, request));

    [HttpPut("interviews/{interviewId:int}")]
    public async Task<IActionResult> UpdateInterview(int interviewId, InterviewRequest request) =>
        InterviewResult(await interviewsService.UpdateAsync(interviewId, request));

    [HttpDelete("interviews/{interviewId:int}")]
    public async Task<IActionResult> DeleteInterview(int interviewId)
    {
        var result = await interviewsService.DeleteAsync(interviewId);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    private IActionResult Result(OperationResult<JobApplicationDetailDto> result) =>
        result.Success
            ? Ok(ApiResponse<JobApplicationDetailDto>.Ok(result.Data))
            : BadRequest(ApiResponse<JobApplicationDetailDto>.Fail(result.Error!));

    private IActionResult InterviewResult(OperationResult<InterviewDto> result) =>
        result.Success
            ? Ok(ApiResponse<InterviewDto>.Ok(result.Data))
            : BadRequest(ApiResponse<InterviewDto>.Fail(result.Error!));
}
