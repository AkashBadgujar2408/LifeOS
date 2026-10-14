using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Shared.ServiceContracts;

public interface IInboxService
{
    Task<List<InboxItemDto>> GetAllAsync(string? kind, bool includeProcessed);
    Task<OperationResult<InboxItemDto>> CreateAsync(CreateInboxItemRequest request);
    Task<OperationResult<InboxItemDto>> SetProcessedAsync(int id, bool processed);
    Task<OperationResult<bool>> DeleteAsync(int id);
}
