using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Shared.ServiceContracts;

/// <summary>The one people list. Modules point at a contact; none keeps its own list.</summary>
public interface IContactsService
{
    /// <summary>By name; only the ones carrying <paramref name="tagId"/> when given.</summary>
    Task<List<ContactDto>> GetAllAsync(int? tagId);
    Task<OperationResult<ContactDto>> GetAsync(int id);
    Task<OperationResult<ContactDto>> CreateAsync(ContactRequest request);
    Task<OperationResult<ContactDto>> UpdateAsync(int id, ContactRequest request);
    /// <summary>Sets "last contacted" to the client's today.</summary>
    Task<OperationResult<ContactDto>> ContactedAsync(int id, DateOnly today);
    /// <summary>Soft-deletes the contact with its tags, links and reminders; whatever pointed at it keeps going without it.</summary>
    Task<OperationResult<bool>> DeleteAsync(int id);
}
