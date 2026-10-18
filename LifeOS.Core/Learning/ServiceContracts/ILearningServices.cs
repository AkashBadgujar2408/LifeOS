using LifeOS.Core.Learning.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Learning.ServiceContracts;

public interface ISkillsService
{
    /// <summary>Strongest first, then by name.</summary>
    Task<List<SkillDto>> GetAllAsync();
    Task<OperationResult<SkillDetailDto>> GetAsync(int id);
    /// <summary>Records the starting level as the first history row.</summary>
    Task<OperationResult<SkillDetailDto>> CreateAsync(SkillRequest request);
    /// <summary>A different proficiency logs a level change (with the request's note, on its day).</summary>
    Task<OperationResult<SkillDetailDto>> UpdateAsync(int id, SkillRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
}

public interface ICoursesService
{
    Task<List<CourseDto>> GetAllAsync(string? status);
    Task<OperationResult<CourseDto>> GetAsync(int id);
    Task<OperationResult<CourseDto>> CreateAsync(CourseRequest request);
    Task<OperationResult<CourseDto>> UpdateAsync(int id, CourseRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
}

public interface IBooksService
{
    Task<List<BookDto>> GetAllAsync(string? status);
    Task<OperationResult<BookDetailDto>> GetAsync(int id);
    Task<OperationResult<BookDetailDto>> CreateAsync(BookRequest request);
    Task<OperationResult<BookDetailDto>> UpdateAsync(int id, BookRequest request);
    /// <summary>Moves the bookmark (LearningRules.AtPage: starts or finishes the book as needed).</summary>
    Task<OperationResult<BookDetailDto>> SetProgressAsync(int id, BookProgressRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
    Task<OperationResult<BookNoteDto>> AddNoteAsync(int bookId, BookNoteRequest request);
    Task<OperationResult<BookNoteDto>> UpdateNoteAsync(int bookId, int noteId, BookNoteRequest request);
    Task<OperationResult<bool>> DeleteNoteAsync(int bookId, int noteId);
}

public interface IRoadmapsService
{
    /// <summary>Active first, then completed, then archived; each with its progress and next step.</summary>
    Task<List<RoadmapDto>> GetAllAsync();
    Task<OperationResult<RoadmapDetailDto>> GetAsync(int id);
    Task<OperationResult<RoadmapDetailDto>> CreateAsync(RoadmapRequest request);
    Task<OperationResult<RoadmapDetailDto>> UpdateAsync(int id, RoadmapRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
    Task<OperationResult<RoadmapDetailDto>> AddStepAsync(int roadmapId, RoadmapStepRequest request);
    Task<OperationResult<RoadmapDetailDto>> UpdateStepAsync(int roadmapId, int stepId, RoadmapStepRequest request);
    /// <summary>Ticks or unticks a step; the last open step finishes the roadmap, unticking one reopens it.</summary>
    Task<OperationResult<StepCompletedResultDto>> SetStepCompletedAsync(int roadmapId, int stepId, bool completed);
    Task<OperationResult<RoadmapDetailDto>> ReorderStepsAsync(int roadmapId, IReadOnlyList<int> stepIds);
    Task<OperationResult<RoadmapDetailDto>> DeleteStepAsync(int roadmapId, int stepId);
}

public interface IStudySessionsService
{
    /// <summary>Sessions on local days <paramref name="from"/>..<paramref name="to"/>, newest first.</summary>
    Task<OperationResult<List<StudySessionDto>>> GetRangeAsync(DateOnly from, DateOnly to);
    Task<OperationResult<StudySessionDto>> CreateAsync(StudySessionRequest request);
    Task<OperationResult<StudySessionDto>> UpdateAsync(int id, StudySessionRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
}

public interface ICertificationsService
{
    /// <summary>Expiring soonest first, then the ones that don't expire.</summary>
    Task<List<CertificationDto>> GetAllAsync();
    Task<OperationResult<CertificationDto>> GetAsync(int id);
    /// <summary>Keeps the renewal reminder in step (CertificationsService.SyncRenewalReminderAsync).</summary>
    Task<OperationResult<CertificationDto>> CreateAsync(CertificationRequest request);
    Task<OperationResult<CertificationDto>> UpdateAsync(int id, CertificationRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
}

public interface IKnowledgeNotesService
{
    /// <summary>Most recently changed first.</summary>
    Task<List<KnowledgeNoteDto>> GetAllAsync();
    /// <summary>Notes due for review on or before <paramref name="today"/>, longest overdue first.</summary>
    Task<List<KnowledgeNoteDto>> GetDueAsync(DateOnly today);
    Task<OperationResult<KnowledgeNoteDto>> GetAsync(int id);
    Task<OperationResult<KnowledgeNoteDto>> CreateAsync(KnowledgeNoteRequest request);
    Task<OperationResult<KnowledgeNoteDto>> UpdateAsync(int id, KnowledgeNoteRequest request);
    /// <summary>Records a review today and schedules the next one (RevisionPlanner.Review).</summary>
    Task<OperationResult<KnowledgeNoteDto>> ReviewAsync(int id, ReviewNoteRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
}
