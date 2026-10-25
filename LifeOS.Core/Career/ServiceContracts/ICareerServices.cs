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

public interface IJobApplicationsService
{
    /// <summary>Every application (or only those with this recruiter/referrer), most recently changed first.</summary>
    Task<List<JobApplicationDto>> GetAllAsync(int? contactId = null);
    /// <summary>With its stage history and interview rounds.</summary>
    Task<OperationResult<JobApplicationDetailDto>> GetAsync(int id);
    /// <summary>Starts at the request's stage, logged as the first stage change.</summary>
    Task<OperationResult<JobApplicationDetailDto>> CreateAsync(JobApplicationRequest request);
    /// <summary>Details only — the stage moves through <see cref="MoveAsync"/>.</summary>
    Task<OperationResult<JobApplicationDetailDto>> UpdateAsync(int id, JobApplicationRequest request);
    /// <summary>Logs the move; a move to Interview can schedule its first round on the calendar.</summary>
    Task<OperationResult<JobApplicationDetailDto>> MoveAsync(int id, ApplicationStageRequest request);
    /// <summary>Its rounds (and their calendar entries) and history go too; its questions stay in the bank.</summary>
    Task<OperationResult<bool>> DeleteAsync(int id);
}

public interface IInterviewsService
{
    /// <summary>A round of the application; with times, it's put on the calendar.</summary>
    Task<OperationResult<InterviewDto>> CreateAsync(int applicationId, InterviewRequest request);
    /// <summary>Keeps the calendar entry in step: created, moved, or removed when the times are cleared.</summary>
    Task<OperationResult<InterviewDto>> UpdateAsync(int id, InterviewRequest request);
    /// <summary>Its calendar entry goes too.</summary>
    Task<OperationResult<bool>> DeleteAsync(int id);
}

public interface IInterviewQuestionsService
{
    /// <summary>Most recently changed first, optionally only one tag's or one application's.</summary>
    Task<List<InterviewQuestionDto>> GetAllAsync(int? tagId, int? applicationId);
    Task<OperationResult<InterviewQuestionDto>> GetAsync(int id);
    Task<OperationResult<InterviewQuestionDto>> CreateAsync(InterviewQuestionRequest request);
    Task<OperationResult<InterviewQuestionDto>> UpdateAsync(int id, InterviewQuestionRequest request);
    /// <summary>Sets the last practised day to the client's today.</summary>
    Task<OperationResult<InterviewQuestionDto>> PractisedAsync(int id, DateOnly today);
    Task<OperationResult<bool>> DeleteAsync(int id);
}

public interface IMockInterviewsService
{
    /// <summary>Newest first (by the day held), optionally only one application's.</summary>
    Task<List<MockInterviewDto>> GetAllAsync(int? applicationId);
    Task<OperationResult<MockInterviewDto>> GetAsync(int id);
    Task<OperationResult<MockInterviewDto>> CreateAsync(MockInterviewRequest request);
    Task<OperationResult<MockInterviewDto>> UpdateAsync(int id, MockInterviewRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
}

public interface IResumeVersionsService
{
    /// <summary>Newest first, each with its file count and the applications it went with.</summary>
    Task<List<ResumeVersionDto>> GetAllAsync();
    Task<OperationResult<ResumeVersionDto>> GetAsync(int id);
    Task<OperationResult<ResumeVersionDto>> CreateAsync(ResumeVersionRequest request);
    Task<OperationResult<ResumeVersionDto>> UpdateAsync(int id, ResumeVersionRequest request);
    /// <summary>Its files go too; applications sent with it keep everything but the reference.</summary>
    Task<OperationResult<bool>> DeleteAsync(int id);
}

public interface IPerformanceReviewsService
{
    /// <summary>Latest first.</summary>
    Task<List<PerformanceReviewDto>> GetAllAsync();
    Task<OperationResult<PerformanceReviewDto>> CreateAsync(PerformanceReviewRequest request);
    Task<OperationResult<PerformanceReviewDto>> UpdateAsync(int id, PerformanceReviewRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
}

public interface ISideIncomeSourcesService
{
    /// <summary>Active, paused, then ended.</summary>
    Task<List<SideIncomeSourceDto>> GetAllAsync();
    Task<OperationResult<SideIncomeSourceDto>> CreateAsync(SideIncomeSourceRequest request);
    Task<OperationResult<SideIncomeSourceDto>> UpdateAsync(int id, SideIncomeSourceRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
}
