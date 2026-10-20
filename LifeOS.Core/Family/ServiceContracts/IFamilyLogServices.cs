using LifeOS.Core.Family.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Family.ServiceContracts;

/// <summary>Being in touch: calls, visits, messages with one or more people. Keeps Contacts.LastContactedOn current.</summary>
public interface IInteractionsService
{
    /// <summary>Newest first; one person's when <paramref name="contactId"/> is given.</summary>
    Task<List<InteractionDto>> GetAllAsync(int? contactId, int take);
    Task<OperationResult<InteractionDto>> CreateAsync(InteractionRequest request);
    Task<OperationResult<InteractionDto>> UpdateAsync(int id, InteractionRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
}

/// <summary>"Keep in touch every N days" per person, and who's past it (computed).</summary>
public interface IKeepInTouchService
{
    /// <summary>Everyone with a cadence, the most past due first.</summary>
    Task<List<KeepInTouchDto>> GetAllAsync(DateOnly today);
    Task<OperationResult<KeepInTouchDto?>> GetAsync(int contactId, DateOnly today);
    /// <summary>Sets or changes the cadence (one per person, rewritten in place).</summary>
    Task<OperationResult<KeepInTouchDto>> SetAsync(int contactId, KeepInTouchRequest request);
    Task<OperationResult<bool>> ClearAsync(int contactId);
}

public interface IGiftIdeasService
{
    Task<List<GiftIdeaDto>> GetAllAsync(int? contactId);
    Task<OperationResult<GiftIdeaDto>> CreateAsync(GiftIdeaRequest request);
    Task<OperationResult<GiftIdeaDto>> UpdateAsync(int id, GiftIdeaRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
}

public interface IResponsibilitiesService
{
    /// <summary>Current ones first, then ended; one person's (for them or held by them) when <paramref name="contactId"/> is given.</summary>
    Task<List<ResponsibilityDto>> GetAllAsync(int? contactId);
    Task<OperationResult<ResponsibilityDto>> CreateAsync(ResponsibilityRequest request);
    Task<OperationResult<ResponsibilityDto>> UpdateAsync(int id, ResponsibilityRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
}

/// <summary>A contact is being deleted: what the family log holds about them is released (called by ContactsService).</summary>
public interface IFamilyLogCleanup
{
    Task ReleaseContactAsync(int contactId);
}
