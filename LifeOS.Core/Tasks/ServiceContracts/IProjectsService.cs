using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Tasks.DTOs;

namespace LifeOS.Core.Tasks.ServiceContracts;

public interface IProjectsService
{
    /// <summary>Every project (any status) with its task counts; the client filters by status.</summary>
    Task<List<ProjectDto>> GetAllAsync();
    Task<OperationResult<ProjectDto>> GetAsync(int id);
    Task<OperationResult<ProjectDto>> CreateAsync(ProjectRequest request);
    Task<OperationResult<ProjectDto>> UpdateAsync(int id, ProjectRequest request);
    Task<OperationResult<ProjectDto>> SetStatusAsync(int id, string status);

    /// <summary>Deletes the project; its tasks stay, just without a project.</summary>
    Task<OperationResult<bool>> DeleteAsync(int id);
}
