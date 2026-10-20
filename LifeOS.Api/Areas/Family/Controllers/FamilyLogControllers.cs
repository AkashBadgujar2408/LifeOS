using LifeOS.Core.Family.DTOs;
using LifeOS.Core.Family.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Family.Controllers;

/// <summary>Reply shapes for the family log's controllers: a business failure is a 400, a missing item a 404.</summary>
public abstract class FamilyLogControllerBase : ControllerBase
{
    protected IActionResult Result<T>(OperationResult<T> result) =>
        result.Success ? Ok(ApiResponse<T>.Ok(result.Data)) : BadRequest(ApiResponse<T>.Fail(result.Error!));

    protected IActionResult Found<T>(OperationResult<T> result) =>
        result.Success ? Ok(ApiResponse<T>.Ok(result.Data)) : NotFound(ApiResponse<T>.Fail(result.Error!));

    /// <summary>"… not found." is a 404 (another user's item, or gone); anything else a 400.</summary>
    protected IActionResult Saved<T>(OperationResult<T> result) =>
        result.Success || !result.Error!.EndsWith("not found.", StringComparison.Ordinal) ? Result(result) : Found(result);
}

[ApiController]
[Area("Family")]
[Route("api/[area]/[controller]")]
[Authorize]
public class InteractionsController(IInteractionsService interactionsService) : FamilyLogControllerBase
{
    /// <summary>GET api/Family/Interactions[?contactId=&amp;take=] — newest first.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] int? contactId, [FromQuery] int take = 100) =>
        Ok(ApiResponse<List<InteractionDto>>.Ok(await interactionsService.GetAllAsync(contactId, take)));

    [HttpPost]
    public async Task<IActionResult> Create(InteractionRequest request) => Saved(await interactionsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, InteractionRequest request) => Saved(await interactionsService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) => Found(await interactionsService.DeleteAsync(id));
}

[ApiController]
[Area("Family")]
[Route("api/[area]/[controller]")]
[Authorize]
public class KeepInTouchController(IKeepInTouchService keepInTouchService) : FamilyLogControllerBase
{
    /// <summary>GET api/Family/KeepInTouch?today= — everyone with a cadence, the most past due first.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] DateOnly today) =>
        Ok(ApiResponse<List<KeepInTouchDto>>.Ok(await keepInTouchService.GetAllAsync(today)));

    /// <summary>GET api/Family/KeepInTouch/{contactId}?today= — data null when they have no cadence.</summary>
    [HttpGet("{contactId:int}")]
    public async Task<IActionResult> Get(int contactId, [FromQuery] DateOnly today) =>
        Found(await keepInTouchService.GetAsync(contactId, today));

    /// <summary>PUT api/Family/KeepInTouch/{contactId} — set or change the cadence.</summary>
    [HttpPut("{contactId:int}")]
    public async Task<IActionResult> Set(int contactId, KeepInTouchRequest request) =>
        Saved(await keepInTouchService.SetAsync(contactId, request));

    [HttpDelete("{contactId:int}")]
    public async Task<IActionResult> Clear(int contactId) => Saved(await keepInTouchService.ClearAsync(contactId));
}

[ApiController]
[Area("Family")]
[Route("api/[area]/[controller]")]
[Authorize]
public class GiftsController(IGiftIdeasService giftIdeasService) : FamilyLogControllerBase
{
    /// <summary>GET api/Family/Gifts[?contactId=] — ideas, then bought, then given.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] int? contactId) =>
        Ok(ApiResponse<List<GiftIdeaDto>>.Ok(await giftIdeasService.GetAllAsync(contactId)));

    [HttpPost]
    public async Task<IActionResult> Create(GiftIdeaRequest request) => Saved(await giftIdeasService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, GiftIdeaRequest request) => Saved(await giftIdeasService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) => Found(await giftIdeasService.DeleteAsync(id));
}

[ApiController]
[Area("Family")]
[Route("api/[area]/[controller]")]
[Authorize]
public class ResponsibilitiesController(IResponsibilitiesService responsibilitiesService) : FamilyLogControllerBase
{
    /// <summary>GET api/Family/Responsibilities[?contactId=] — current ones first.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] int? contactId) =>
        Ok(ApiResponse<List<ResponsibilityDto>>.Ok(await responsibilitiesService.GetAllAsync(contactId)));

    [HttpPost]
    public async Task<IActionResult> Create(ResponsibilityRequest request) => Saved(await responsibilitiesService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, ResponsibilityRequest request) =>
        Saved(await responsibilitiesService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) => Found(await responsibilitiesService.DeleteAsync(id));
}
