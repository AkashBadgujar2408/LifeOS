using LifeOS.Core.Learning.DTOs;
using LifeOS.Core.Learning.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace LifeOS.Api.Areas.Learning.Controllers;

[ApiController]
[Area("Learning")]
[Route("api/[area]/[controller]")]
[Authorize]
public class KnowledgeNotesController(IKnowledgeNotesService knowledgeNotesService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll() =>
        Ok(ApiResponse<List<KnowledgeNoteDto>>.Ok(await knowledgeNotesService.GetAllAsync()));

    /// <summary>GET api/Learning/KnowledgeNotes/due?today=2026-10-18 — the revision planner's "due today".</summary>
    [HttpGet("due")]
    public async Task<IActionResult> GetDue([FromQuery, BindRequired] DateOnly today) =>
        Ok(ApiResponse<List<KnowledgeNoteDto>>.Ok(await knowledgeNotesService.GetDueAsync(today)));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id)
    {
        var result = await knowledgeNotesService.GetAsync(id);
        return result.Success ? Ok(ApiResponse<KnowledgeNoteDto>.Ok(result.Data)) : NotFound(ApiResponse<KnowledgeNoteDto>.Fail(result.Error!));
    }

    [HttpPost]
    public async Task<IActionResult> Create(KnowledgeNoteRequest request) => Result(await knowledgeNotesService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, KnowledgeNoteRequest request) => Result(await knowledgeNotesService.UpdateAsync(id, request));

    /// <summary>POST api/Learning/KnowledgeNotes/4/review { "remembered": true, "today": "2026-10-18" }</summary>
    [HttpPost("{id:int}/review")]
    public async Task<IActionResult> Review(int id, ReviewNoteRequest request) => Result(await knowledgeNotesService.ReviewAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await knowledgeNotesService.DeleteAsync(id);
        return result.Success ? Ok(ApiResponse<bool>.Ok(true)) : NotFound(ApiResponse<bool>.Fail(result.Error!));
    }

    private IActionResult Result(OperationResult<KnowledgeNoteDto> result) =>
        result.Success ? Ok(ApiResponse<KnowledgeNoteDto>.Ok(result.Data)) : BadRequest(ApiResponse<KnowledgeNoteDto>.Fail(result.Error!));
}
