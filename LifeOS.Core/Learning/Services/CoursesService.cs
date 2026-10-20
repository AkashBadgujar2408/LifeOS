using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Learning.DTOs;
using LifeOS.Core.Learning.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Learning.Services;

/// <summary>Courses: CRUD, with status/progress/dates kept consistent by LearningRules.Course.</summary>
public class CoursesService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService,
    IGoalMeasureService goalMeasureService) : ICoursesService
{
    private const string NotFound = "Course not found.";

    public async Task<List<CourseDto>> GetAllAsync(string? status)
    {
        var query = db.Courses.AsQueryable();
        if (!string.IsNullOrWhiteSpace(status))
        {
            query = query.Where(c => c.Status == status);
        }

        return await query
            .OrderBy(c => c.Status == CourseStatuses.InProgress ? 0 : c.Status == CourseStatuses.Planned ? 1 : c.Status == CourseStatuses.Completed ? 2 : 3)
            .ThenByDescending(c => c.CompletedOn)
            .ThenBy(c => c.Title)
            .Select(ToDto)
            .ToListAsync();
    }

    public async Task<OperationResult<CourseDto>> GetAsync(int id)
    {
        var course = await db.Courses.Where(c => c.Id == id).Select(ToDto).FirstOrDefaultAsync();
        return course is null ? OperationResult<CourseDto>.Fail(NotFound) : OperationResult<CourseDto>.Ok(course);
    }

    public async Task<OperationResult<CourseDto>> CreateAsync(CourseRequest request)
    {
        var course = new Course { UserId = db.CurrentUserId!.Value };
        var error = await ApplyAsync(course, request);
        if (error is not null)
        {
            return OperationResult<CourseDto>.Fail(error);
        }

        db.Courses.Add(course);
        await db.SaveChangesAsync();
        return await GetAsync(course.Id);
    }

    public async Task<OperationResult<CourseDto>> UpdateAsync(int id, CourseRequest request)
    {
        var course = await db.Courses.FindAsync(id);
        if (course is null)
        {
            return OperationResult<CourseDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(course, request);
        if (error is not null)
        {
            return OperationResult<CourseDto>.Fail(error);
        }

        course.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    /// <summary>Soft-deletes the course; roadmap steps and certifications that named it keep going without it.</summary>
    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var course = await db.Courses.FindAsync(id);
        if (course is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        // Goals counted from it keep what it counted (Carried over), read before anything it serves is released.
        await goalMeasureService.ReleaseEntityAsync(CourseLinkableProvider.Type, id);
        await db.RoadmapSteps.Where(s => s.CourseId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.CourseId, (int?)null).SetProperty(x => x.UpdatedAt, now));
        await db.Certifications.Where(c => c.CourseId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.CourseId, (int?)null).SetProperty(x => x.UpdatedAt, now));
        course.IsDeleted = true;
        course.DeletedAt = now;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(CourseLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(CourseLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<string?> ApplyAsync(Course course, CourseRequest request)
    {
        var title = request.Title.Trim();
        if (title.Length == 0)
        {
            return "Give the course a title.";
        }

        if (request.Today == default)
        {
            return "Today's date is required.";
        }

        var (state, error) = LearningRules.Course(request.Status, request.ProgressPercent, request.StartedOn, request.CompletedOn, request.Today);
        error ??= await LearningLookups.CheckAsync(db, request.LifeAreaId, [], request.SkillId);
        if (error is not null)
        {
            return error;
        }

        course.Title = title;
        course.Provider = Clean(request.Provider);
        course.Url = Clean(request.Url);
        course.Notes = Clean(request.Notes);
        course.SkillId = request.SkillId;
        course.LifeAreaId = request.LifeAreaId;
        course.Status = state!.Status;
        course.ProgressPercent = state.ProgressPercent;
        course.StartedOn = state.StartedOn;
        course.CompletedOn = state.CompletedOn;
        return null;
    }

    private static string? Clean(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();

    private static readonly System.Linq.Expressions.Expression<Func<Course, CourseDto>> ToDto = c => new CourseDto
    {
        Id = c.Id,
        Title = c.Title,
        Provider = c.Provider,
        Url = c.Url,
        Status = c.Status,
        ProgressPercent = c.ProgressPercent,
        StartedOn = c.StartedOn,
        CompletedOn = c.CompletedOn,
        Notes = c.Notes,
        SkillId = c.SkillId,
        SkillName = c.Skill != null ? c.Skill.Name : null,
        LifeAreaId = c.LifeAreaId,
        LifeAreaName = c.LifeArea != null ? c.LifeArea.Name : null,
    };
}
