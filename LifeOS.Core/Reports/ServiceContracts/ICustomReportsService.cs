using LifeOS.Core.Reports.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Reports.ServiceContracts;

public interface ICustomReportsService
{
    /// <summary>What a custom report can count.</summary>
    IReadOnlyList<CustomMetricDto> Metrics();

    /// <summary>Runs a definition (saved or not) for <paramref name="today"/> in <paramref name="timeZone"/>.</summary>
    Task<OperationResult<CustomReportResultDto>> RunAsync(CustomReportDefinition definition, DateOnly today, string? timeZone);

    Task<OperationResult<CustomReportResultDto>> RunSavedAsync(int id, DateOnly today, string? timeZone);

    Task<List<SavedReportDto>> ListAsync();
    Task<OperationResult<SavedReportDto>> GetAsync(int id);
    Task<OperationResult<SavedReportDto>> CreateAsync(SavedReportRequest request, DateOnly today);
    Task<OperationResult<SavedReportDto>> UpdateAsync(int id, SavedReportRequest request, DateOnly today);
    Task<OperationResult<bool>> DeleteAsync(int id);
}
