using LifeOS.Core.Career.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Career.ServiceContracts;

public interface IEmploymentsService
{
    /// <summary>Every role, latest start first.</summary>
    Task<List<EmploymentDto>> GetAllAsync();
    Task<OperationResult<EmploymentDto>> GetAsync(int id);
    Task<OperationResult<EmploymentDto>> CreateAsync(EmploymentRequest request);
    Task<OperationResult<EmploymentDto>> UpdateAsync(int id, EmploymentRequest request);
    /// <summary>Ends the role the day before, starts the new one, records the Promotion achievement and the new pay.</summary>
    Task<OperationResult<PromotionResultDto>> PromoteAsync(int id, PromotionRequest request);
    /// <summary>Its salary records, achievements and reviews stay, without a role.</summary>
    Task<OperationResult<bool>> DeleteAsync(int id);
}

public interface ISalaryRecordsService
{
    /// <summary>Latest first, each with its change % (SalaryHistory).</summary>
    Task<List<SalaryRecordDto>> GetAllAsync();
    Task<OperationResult<SalaryRecordDto>> CreateAsync(SalaryRecordRequest request);
    Task<OperationResult<SalaryRecordDto>> UpdateAsync(int id, SalaryRecordRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
}

public interface ICareerAchievementsService
{
    /// <summary>Latest first.</summary>
    Task<List<CareerAchievementDto>> GetAllAsync();
    Task<OperationResult<CareerAchievementDto>> GetAsync(int id);
    Task<OperationResult<CareerAchievementDto>> CreateAsync(CareerAchievementRequest request);
    Task<OperationResult<CareerAchievementDto>> UpdateAsync(int id, CareerAchievementRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
}
