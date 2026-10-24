using LifeOS.Core.Assistant.DTOs;
using LifeOS.Core.Assistant.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Assistant.Controllers;

/// <summary>
/// The assistant's settings: GET; PUT key { apiKey }; DELETE key; PUT preferences { isEnabled, model }; POST test.
/// The key is write-only — no response ever carries it.
/// </summary>
[ApiController]
[Area("Assistant")]
[Route("api/[area]/[controller]")]
[Authorize]
public class SettingsController(IAssistantSettingsService settingsService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get() => Ok(ApiResponse<AssistantSettingsDto>.Ok(await settingsService.GetAsync()));

    [HttpPut("key")]
    public async Task<IActionResult> SaveKey(AssistantKeyRequest request) => Respond(await settingsService.SaveKeyAsync(request));

    [HttpDelete("key")]
    public async Task<IActionResult> RemoveKey() => Ok(ApiResponse<AssistantSettingsDto>.Ok(await settingsService.RemoveKeyAsync()));

    [HttpPut("preferences")]
    public async Task<IActionResult> Update(AssistantPreferencesRequest request) => Respond(await settingsService.UpdateAsync(request));

    [HttpPost("test")]
    public async Task<IActionResult> Test(CancellationToken cancellationToken)
    {
        var result = await settingsService.TestKeyAsync(cancellationToken);
        return result.Success
            ? Ok(ApiResponse<AssistantKeyTestDto>.Ok(result.Data))
            : BadRequest(ApiResponse<AssistantKeyTestDto>.Fail(result.Error!));
    }

    private IActionResult Respond(OperationResult<AssistantSettingsDto> result) => result.Success
        ? Ok(ApiResponse<AssistantSettingsDto>.Ok(result.Data))
        : BadRequest(ApiResponse<AssistantSettingsDto>.Fail(result.Error!));
}

/// <summary>
/// POST api/Assistant/Chat { messages, today, timeZone } — one answer. Health is read only when the request carries
/// a live X-Vault-Unlock (the client sends it when the vault is already open; the chat never asks for it).
/// </summary>
[ApiController]
[Area("Assistant")]
[Route("api/[area]/[controller]")]
[Authorize]
public class ChatController(IAssistantService assistantService) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Chat(ChatRequest request, CancellationToken cancellationToken)
    {
        var result = await assistantService.ChatAsync(request, cancellationToken);
        return result.Success
            ? Ok(ApiResponse<ChatReplyDto>.Ok(result.Data))
            : BadRequest(ApiResponse<ChatReplyDto>.Fail(result.Error!));
    }
}

/// <summary>
/// The assistant's writes: POST api/Assistant/Actions/confirm { action, arguments, today, timeZone } — Confirm on a
/// card, written through the module's service and logged; GET api/Assistant/Actions?take= — what it wrote, newest
/// first. There is no delete: only the create/update actions exist.
/// </summary>
[ApiController]
[Area("Assistant")]
[Route("api/[area]/[controller]")]
[Authorize]
public class ActionsController(IAssistantService assistantService) : ControllerBase
{
    [HttpPost("confirm")]
    public async Task<IActionResult> Confirm(ConfirmActionRequest request)
    {
        var result = await assistantService.ConfirmAsync(request);
        return result.Success
            ? Ok(ApiResponse<ActionResultDto>.Ok(result.Data))
            : BadRequest(ApiResponse<ActionResultDto>.Fail(result.Error!));
    }

    [HttpGet]
    public async Task<IActionResult> Log([FromQuery] int take = 50) =>
        Ok(ApiResponse<List<ActionLogDto>>.Ok(await assistantService.GetActionLogAsync(take)));
}
