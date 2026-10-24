using LifeOS.Core.Assistant.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Assistant.ServiceContracts;

/// <summary>The logged-in user's assistant settings and their own Mistral API key (stored encrypted, never returned).</summary>
public interface IAssistantSettingsService
{
    Task<AssistantSettingsDto> GetAsync();

    /// <summary>Saves (or replaces) the key; it isn't checked with Mistral here — "Test key" does that.</summary>
    Task<OperationResult<AssistantSettingsDto>> SaveKeyAsync(AssistantKeyRequest request);

    /// <summary>Forgets the key and switches the assistant off.</summary>
    Task<AssistantSettingsDto> RemoveKeyAsync();

    /// <summary>On/off and the model. Switching on needs a key.</summary>
    Task<OperationResult<AssistantSettingsDto>> UpdateAsync(AssistantPreferencesRequest request);

    /// <summary>Asks Mistral whether the stored key works (lists models, so it costs no tokens).</summary>
    Task<OperationResult<AssistantKeyTestDto>> TestKeyAsync(CancellationToken cancellationToken);
}

/// <summary>The chat: answers questions about the user's own LifeOS data, reading it through the modules' services.</summary>
public interface IAssistantService
{
    Task<OperationResult<ChatReplyDto>> ChatAsync(ChatRequest request, CancellationToken cancellationToken);

    /// <summary>Confirm on a card: checks the proposal again and writes it through the module's service, then logs it.</summary>
    Task<OperationResult<ActionResultDto>> ConfirmAsync(ConfirmActionRequest request);

    /// <summary>What the assistant wrote, newest first.</summary>
    Task<List<ActionLogDto>> GetActionLogAsync(int take);
}

/// <summary>
/// The Story narrator: a short narration of the recap or a year, written by Mistral from only the lines the page
/// shows. Nothing is stored unless the user keeps it.
/// </summary>
public interface INarratorService
{
    Task<OperationResult<NarrationDto>> NarrateAsync(NarrateRequest request, CancellationToken cancellationToken);

    /// <summary>The kept narration of the recap (year null) or a year, if any.</summary>
    Task<KeptNarrationDto?> GetKeptAsync(string scope, int? year);

    Task<OperationResult<KeptNarrationDto>> KeepAsync(KeepNarrationRequest request);

    /// <summary>Forgets a kept narration (the user's own text; nothing else is touched).</summary>
    Task RemoveKeptAsync(string scope, int? year);
}
