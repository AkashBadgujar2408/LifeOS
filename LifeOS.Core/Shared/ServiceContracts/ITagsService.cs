using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Shared.ServiceContracts;

public interface ITagsService
{
    Task<List<TagDto>> GetAllAsync();
    Task<OperationResult<TagDto>> CreateAsync(string name);
    Task<OperationResult<TagDto>> RenameAsync(int id, string name);
    Task<OperationResult<bool>> DeleteAsync(int id);
}
