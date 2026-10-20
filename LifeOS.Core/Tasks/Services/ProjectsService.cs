using AutoMapper;
using AutoMapper.QueryableExtensions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Goals.Services;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using LifeOS.Core.Tasks.DTOs;
using LifeOS.Core.Tasks.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Tasks.Services;

public class ProjectsService(AppDbContext db, IMapper mapper, IEntityLinksService entityLinksService,
    IRemindersService remindersService, MilestoneLinksService milestoneLinks, IGoalMeasureService goalMeasureService)
    : IProjectsService
{
    private const string NotFound = "Project not found.";
    private const string DuplicateName = "A project with this name already exists.";

    public async Task<List<ProjectDto>> GetAllAsync()
    {
        return await db.Projects
            .OrderBy(p => p.Name)
            .ProjectTo<ProjectDto>(mapper.ConfigurationProvider)
            .ToListAsync();
    }

    public async Task<OperationResult<ProjectDto>> GetAsync(int id)
    {
        var project = await db.Projects
            .Where(p => p.Id == id)
            .ProjectTo<ProjectDto>(mapper.ConfigurationProvider)
            .FirstOrDefaultAsync();

        return project is null ? OperationResult<ProjectDto>.Fail(NotFound) : OperationResult<ProjectDto>.Ok(project);
    }

    public async Task<OperationResult<ProjectDto>> CreateAsync(ProjectRequest request)
    {
        var name = request.Name.Trim();
        if (name.Length == 0)
        {
            return OperationResult<ProjectDto>.Fail("Name is required.");
        }

        if (await db.Projects.AnyAsync(p => p.Name == name))
        {
            return OperationResult<ProjectDto>.Fail(DuplicateName);
        }

        var project = new Project
        {
            UserId = db.CurrentUserId!.Value,
            Name = name,
            Description = NormalizeText(request.Description),
            Status = ProjectStatuses.Active,
        };
        db.Projects.Add(project);

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<ProjectDto>.Fail(DuplicateName);
        }

        return await GetAsync(project.Id);
    }

    public async Task<OperationResult<ProjectDto>> UpdateAsync(int id, ProjectRequest request)
    {
        var project = await db.Projects.FindAsync(id);
        if (project is null)
        {
            return OperationResult<ProjectDto>.Fail(NotFound);
        }

        var name = request.Name.Trim();
        if (name.Length == 0)
        {
            return OperationResult<ProjectDto>.Fail("Name is required.");
        }

        if (await db.Projects.AnyAsync(p => p.Name == name && p.Id != id))
        {
            return OperationResult<ProjectDto>.Fail(DuplicateName);
        }

        project.Name = name;
        project.Description = NormalizeText(request.Description);
        project.UpdatedAt = DateTime.UtcNow;

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<ProjectDto>.Fail(DuplicateName);
        }

        return await GetAsync(id);
    }

    public async Task<OperationResult<ProjectDto>> SetStatusAsync(int id, string status)
    {
        var project = await db.Projects.FindAsync(id);
        if (project is null)
        {
            return OperationResult<ProjectDto>.Fail(NotFound);
        }

        project.Status = status;
        project.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        // Marking it Completed (or reopening it) ticks or unticks the milestones that track it.
        await milestoneLinks.SyncAsync([], [id]);

        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var project = await db.Projects.FindAsync(id);
        if (project is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();

        // Goals counted from it keep what it counted (read while its tasks still belong to it); milestones that
        // tracked it keep their tick and stop pointing at it.
        await goalMeasureService.ReleaseEntityAsync(ProjectLinkableProvider.Type, id);
        await milestoneLinks.ReleaseAsync(null, id);

        // The tasks are real work in their own right: they stay, just without a project. (Already-deleted tasks
        // keep their ProjectId; the project row is only soft-deleted, so the FK still holds.)
        await db.TaskItems
            .Where(t => t.ProjectId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.ProjectId, (int?)null).SetProperty(t => t.UpdatedAt, now));

        // A household project is this project plus a budget: it goes with it.
        await db.HouseholdProjects
            .Where(h => h.ProjectId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(h => h.IsDeleted, true).SetProperty(h => h.DeletedAt, now));

        project.IsDeleted = true;
        project.DeletedAt = now;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(ProjectLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(ProjectLinkableProvider.Type, id);

        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private static string? NormalizeText(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();
}
