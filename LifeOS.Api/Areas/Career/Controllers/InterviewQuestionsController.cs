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
public class InterviewQuestionsController(IInterviewQuestionsService questionsService) : ControllerBase
{
    /// <summary>GET api/Career/InterviewQuestions[?tagId=&amp;applicationId=] — the question bank.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll(int? tagId, int? applicationId) =>
        Ok(ApiResponse<List<InterviewQuestionDto>>.Ok(await questionsService.GetAllAsync(tagId, applicationId)));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var result = await questionsService.GetAsync(id);
        return result.Success
            ? Ok(ApiResponse<InterviewQuestionDto>.Ok(result.Data))
            : NotFound(ApiResponse<InterviewQuestionDto>.Fail(result.Error!));
    }

    [HttpPost]
    public async Task<IActionResult> Create(InterviewQuestionRequest request) => Result(await questionsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, InterviewQuestionRequest request) => Result(await questionsService.UpdateAsync(id, request));

    /// <summary>PUT api/Career/InterviewQuestions/{id}/practised — went over it today.</summary>
    [HttpPut("{id:int}/practised")]
    public async Task<IActionResult> Practised(int id, QuestionPractisedRequest request) =>
        Result(await questionsService.PractisedAsync(id, request.Today));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await questionsService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    private IActionResult Result(OperationResult<InterviewQuestionDto> result) =>
        result.Success
            ? Ok(ApiResponse<InterviewQuestionDto>.Ok(result.Data))
            : BadRequest(ApiResponse<InterviewQuestionDto>.Fail(result.Error!));
}
