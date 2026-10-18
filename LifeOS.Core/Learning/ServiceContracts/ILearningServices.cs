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
