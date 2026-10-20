using LifeOS.Core.Career.Services;
using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Finance.Services;
using LifeOS.Core.Home.DTOs;
using LifeOS.Core.Home.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.Services;
using LifeOS.Core.Tasks.DTOs;
using LifeOS.Core.Tasks.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Home.Services;

/// <summary>
/// A household project (repaint the flat) is an ordinary tasks project — its name, status and tasks live there — plus
/// a property and a budget kept here. What's been spent is the Finance expenses **linked** to the project (looked up
/// both ways, since links are stored canonically), per currency; never stored. Deleting a household project only
/// stops tracking it as one: the tasks project stays.
/// </summary>
public class HouseholdProjectsService(AppDbContext db) : IHouseholdProjectsService
{
    private const string NotFound = "Household project not found.";
    private const string DuplicateName = "A project with this name already exists.";

    private static readonly HashSet<string> Statuses = [ProjectStatuses.Active, ProjectStatuses.Completed, ProjectStatuses.Archived];

    public async Task<List<HouseholdProjectDto>> GetAllAsync()
    {
        var projects = await Project(db.HouseholdProjects).ToListAsync();
        await FillSpentAsync(projects);
        // Active first, then finished, A–Z inside.
        return projects
            .OrderBy(p => p.Status != ProjectStatuses.Active)
            .ThenBy(p => p.Name, StringComparer.CurrentCultureIgnoreCase)
            .ToList();
    }

    public async Task<OperationResult<HouseholdProjectDto>> GetAsync(int id)
    {
        var project = await Project(db.HouseholdProjects.Where(h => h.Id == id)).FirstOrDefaultAsync();
        if (project is null)
        {
            return OperationResult<HouseholdProjectDto>.Fail(NotFound);
        }

        await FillSpentAsync([project]);
        return OperationResult<HouseholdProjectDto>.Ok(project);
    }

    public async Task<OperationResult<HouseholdProjectDto>> CreateAsync(HouseholdProjectRequest request)
    {
        var userId = db.CurrentUserId!.Value;
        var project = new Project { UserId = userId };
        var household = new HouseholdProject { UserId = userId, Project = project };
        var error = await ApplyAsync(household, project, request, null);
        if (error is not null)
        {
            return OperationResult<HouseholdProjectDto>.Fail(error);
        }

        db.HouseholdProjects.Add(household);
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<HouseholdProjectDto>.Fail(DuplicateName);
        }

        return await GetAsync(household.Id);
    }

    public async Task<OperationResult<HouseholdProjectDto>> UpdateAsync(int id, HouseholdProjectRequest request)
    {
        var household = await db.HouseholdProjects.Include(h => h.Project).FirstOrDefaultAsync(h => h.Id == id);
        if (household is null)
        {
            return OperationResult<HouseholdProjectDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(household, household.Project, request, household.ProjectId);
        if (error is not null)
        {
            return OperationResult<HouseholdProjectDto>.Fail(error);
        }

        household.UpdatedAt = household.Project.UpdatedAt = DateTime.UtcNow;
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<HouseholdProjectDto>.Fail(DuplicateName);
        }

        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var household = await db.HouseholdProjects.FindAsync(id);
        if (household is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        household.IsDeleted = true;
        household.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<string?> ApplyAsync(HouseholdProject household, Project project, HouseholdProjectRequest request, int? projectId)
    {
        var name = request.Name.Trim();
        if (name.Length == 0)
        {
            return "Name the project (e.g. Repaint the flat).";
        }

        if (!Statuses.Contains(request.Status))
        {
            return "Status must be Active, Completed or Archived.";
        }

        var currency = request.Budget is null ? null : CareerRules.Currency(request.Currency);
        if (request.Budget is <= 0 || request.Budget > FinanceRules.MaxAmount)
        {
            return "The budget has to be more than zero (leave it blank if there's none).";
        }

        if (request.Budget is not null && currency is null)
        {
            return "Choose the budget's currency.";
        }

        if (await db.Projects.AnyAsync(p => p.Name == name && p.Id != projectId))
        {
            return DuplicateName;
        }

        if (request.PropertyId is { } propertyId && !await db.Properties.AnyAsync(p => p.Id == propertyId))
        {
            return "Property not found.";
        }

        project.Name = name;
        project.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        project.Status = request.Status;
        household.PropertyId = request.PropertyId;
        household.Budget = request.Budget;
        household.Currency = currency;
        return null;
    }

    /// <summary>Expenses linked to each project, per currency, and the share of the budget they make.</summary>
    private async Task FillSpentAsync(List<HouseholdProjectDto> projects)
    {
        if (projects.Count == 0)
        {
            return;
        }

        var projectType = ProjectLinkableProvider.Type;
        var transactionType = TransactionLinkableProvider.Type;
        var ids = projects.Select(p => p.ProjectId).ToList();
        // Links are stored with the ordinally smaller type first, so look both ways.
        var links = await db.EntityLinks
            .Where(l => (l.SourceEntityType == projectType && ids.Contains(l.SourceEntityId) && l.TargetEntityType == transactionType)
                || (l.TargetEntityType == projectType && ids.Contains(l.TargetEntityId) && l.SourceEntityType == transactionType))
            .Select(l => l.SourceEntityType == projectType
                ? new { ProjectId = l.SourceEntityId, TransactionId = l.TargetEntityId }
                : new { ProjectId = l.TargetEntityId, TransactionId = l.SourceEntityId })
            .ToListAsync();
        var transactionIds = links.Select(l => l.TransactionId).Distinct().ToList();
        var expenses = await db.Transactions
            .Where(t => transactionIds.Contains(t.Id) && t.Kind == TransactionKinds.Expense)
            .Select(t => new { t.Id, t.Amount, t.Currency })
            .ToDictionaryAsync(t => t.Id);

        foreach (var project in projects)
        {
            var spent = links
                .Where(l => l.ProjectId == project.ProjectId && expenses.ContainsKey(l.TransactionId))
                .Select(l => expenses[l.TransactionId])
                .GroupBy(t => t.Currency)
                .Select(g => (Currency: g.Key, Amount: g.Sum(t => t.Amount)))
                .OrderBy(s => s.Currency != project.Currency).ThenBy(s => s.Currency, StringComparer.Ordinal)
                .ToList();
            project.Spent = spent.Select(s => new MoneyDto { Currency = s.Currency, Amount = s.Amount }).ToList();
            project.BudgetPercent = HomeRules.BudgetPercent(project.Budget, project.Currency, spent);
        }
    }

    private static IQueryable<HouseholdProjectDto> Project(IQueryable<HouseholdProject> query) =>
        query.Select(h => new HouseholdProjectDto
        {
            Id = h.Id,
            ProjectId = h.ProjectId,
            Name = h.Project.Name,
            Status = h.Project.Status,
            Description = h.Project.Description,
            PropertyId = h.PropertyId,
            PropertyName = h.Property != null ? h.Property.Name : null,
            Budget = h.Budget,
            Currency = h.Currency,
            OpenTasks = h.Project.TaskItems.Count(t => t.Status != "Done"),
            DoneTasks = h.Project.TaskItems.Count(t => t.Status == "Done"),
        });
}
