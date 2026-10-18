using AutoMapper;
using AutoMapper.QueryableExtensions;
using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Goals.Services;

public class GoalsService(AppDbContext db, IMapper mapper, IEntityLinksService entityLinksService,
    IRemindersService remindersService, IAttachmentsService attachmentsService) : IGoalsService
{
    private const string NotFound = "Goal not found.";

    public async Task<List<GoalSummaryDto>> GetAllAsync(string? status)
    {
        var query = db.Goals.AsQueryable();
        if (!string.IsNullOrWhiteSpace(status))
        {
            query = query.Where(g => g.Status == status);
        }

        // Tags are the only collection here (milestones come back as counts), so no join fan-out.
        var goals = await query
            .OrderBy(g => g.TargetDate == null)
            .ThenBy(g => g.TargetDate)
            .ThenByDescending(g => g.CreatedAt)
            .ProjectTo<GoalSummaryDto>(mapper.ConfigurationProvider)
            .ToListAsync();

        foreach (var goal in goals)
        {
            goal.ProgressPercent = GoalProgress.Percent(goal.Status, goal.MilestoneCount, goal.CompletedMilestoneCount);
        }

        return goals;
    }

    public async Task<OperationResult<GoalDetailDto>> GetAsync(int id)
    {
        // Milestones + tags are two collections: split so SQL doesn't return milestones x tags rows.
        var goal = await db.Goals
            .Where(g => g.Id == id)
            .ProjectTo<GoalDetailDto>(mapper.ConfigurationProvider)
            .AsSplitQuery()
            .FirstOrDefaultAsync();
        if (goal is null)
        {
            return OperationResult<GoalDetailDto>.Fail(NotFound);
        }

        goal.ProgressPercent = GoalProgress.Percent(goal.Status, goal.MilestoneCount, goal.CompletedMilestoneCount);
        return OperationResult<GoalDetailDto>.Ok(goal);
    }

    public async Task<OperationResult<List<GoalTrendPointDto>>> GetTrendAsync(int id)
    {
        var goal = await db.Goals.Where(g => g.Id == id)
            .Select(g => new { g.CreatedAt, g.Status, g.UserId })
            .FirstOrDefaultAsync();
        if (goal is null)
        {
            return OperationResult<List<GoalTrendPointDto>>.Fail(NotFound);
        }

        // Removed milestones still shaped the past, so read them too — IgnoreQueryFilters drops the user filter as
        // well, hence the explicit UserId.
        var milestones = await db.GoalMilestones.IgnoreQueryFilters()
            .Where(m => m.GoalId == id && m.UserId == goal.UserId)
            .Select(m => new TrendMilestone(m.CreatedAt, m.CompletedAt, m.IsDeleted ? m.DeletedAt ?? m.CreatedAt : null))
            .ToListAsync();
        var statusChanges = await db.GoalHistories
            .Where(h => h.GoalId == id && h.EventType == GoalHistoryEvents.StatusChanged)
            .Select(h => new TrendStatusChange(h.CreatedAt, h.FromStatus!, h.ToStatus!))
            .ToListAsync();

        return OperationResult<List<GoalTrendPointDto>>.Ok(
            GoalProgressTrend.Build(goal.CreatedAt, goal.Status, milestones, statusChanges, DateTime.UtcNow));
    }

    public async Task<OperationResult<GoalDetailDto>> CreateAsync(GoalRequest request)
    {
        var error = await ValidateAsync(request);
        if (error is not null)
        {
            return OperationResult<GoalDetailDto>.Fail(error);
        }

        var userId = db.CurrentUserId!.Value;
        var goal = new Goal { UserId = userId, Status = GoalStatuses.Active };
        Apply(goal, request);
        foreach (var tagId in request.TagIds.Distinct())
        {
            goal.GoalTags.Add(new GoalTag { UserId = userId, TagId = tagId });
        }

        db.Goals.Add(goal);
        await db.SaveChangesAsync();

        return await GetAsync(goal.Id);
    }

    public async Task<OperationResult<GoalDetailDto>> UpdateAsync(int id, GoalRequest request)
    {
        var goal = await db.Goals.FindAsync(id);
        if (goal is null)
        {
            return OperationResult<GoalDetailDto>.Fail(NotFound);
        }

        var error = await ValidateAsync(request);
        if (error is not null)
        {
            return OperationResult<GoalDetailDto>.Fail(error);
        }

        var wanted = request.TagIds.Distinct().ToHashSet();
        var current = await db.GoalTags.Where(gt => gt.GoalId == id).ToListAsync();
        var tagsChanged = !wanted.SetEquals(current.Select(gt => gt.TagId));

        // Any real change is a revision: log what changed (and the target date move) before overwriting it.
        var changedFields = ChangedFields(goal, request, tagsChanged);
        if (changedFields.Count > 0)
        {
            var targetDateMoved = goal.TargetDate != request.TargetDate;
            db.GoalHistories.Add(new GoalHistory
            {
                UserId = goal.UserId,
                GoalId = id,
                EventType = GoalHistoryEvents.Revised,
                ChangedFields = string.Join(',', changedFields),
                PreviousTargetDate = targetDateMoved ? goal.TargetDate : null,
                NewTargetDate = targetDateMoved ? request.TargetDate : null,
                Note = NormalizeNote(request.RevisionNote),
            });
            goal.UpdatedAt = DateTime.UtcNow;
        }

        Apply(goal, request);

        // Sync tags: soft-delete the removed ones, add a fresh row for each added one (the filtered unique
        // index lets a previously removed tag come back as a new row).
        foreach (var goalTag in current.Where(gt => !wanted.Contains(gt.TagId)))
        {
            goalTag.IsDeleted = true;
            goalTag.DeletedAt = DateTime.UtcNow;
        }

        foreach (var tagId in wanted.Except(current.Select(gt => gt.TagId)))
        {
            db.GoalTags.Add(new GoalTag { UserId = goal.UserId, GoalId = id, TagId = tagId });
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            // Two concurrent saves of the same goal both added the same tag; the other one won.
            return OperationResult<GoalDetailDto>.Fail("This goal was changed somewhere else at the same time. Reload and try again.");
        }

        return await GetAsync(id);
    }

    public async Task<OperationResult<GoalDetailDto>> SetStatusAsync(int id, SetGoalStatusRequest request)
    {
        var goal = await db.Goals.FindAsync(id);
        if (goal is null)
        {
            return OperationResult<GoalDetailDto>.Fail(NotFound);
        }

        if (goal.Status == request.Status)
        {
            return OperationResult<GoalDetailDto>.Fail($"This goal is already {request.Status.ToLowerInvariant()}.");
        }

        db.GoalHistories.Add(new GoalHistory
        {
            UserId = goal.UserId,
            GoalId = id,
            EventType = GoalHistoryEvents.StatusChanged,
            FromStatus = goal.Status,
            ToStatus = request.Status,
            Note = NormalizeNote(request.Note),
        });

        // CK_Goals_CompletedAt: only a Completed goal may carry CompletedAt, so leaving Completed clears it.
        goal.Status = request.Status;
        goal.CompletedAt = request.Status == GoalStatuses.Completed ? DateTime.UtcNow : null;
        goal.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var goal = await db.Goals.FindAsync(id);
        if (goal is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();

        await db.GoalMilestones
            .Where(m => m.GoalId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.IsDeleted, true).SetProperty(m => m.DeletedAt, now));
        await db.GoalTags
            .Where(gt => gt.GoalId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(gt => gt.IsDeleted, true).SetProperty(gt => gt.DeletedAt, now));
        await db.GoalHistories
            .Where(h => h.GoalId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(h => h.IsDeleted, true).SetProperty(h => h.DeletedAt, now));
        // Story Mode: the goal stops unlocking (and needing) other missions, and its debrief goes with it.
        await db.MissionPrerequisites
            .Where(p => p.GoalId == id || p.RequiresGoalId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.IsDeleted, true).SetProperty(p => p.DeletedAt, now));
        await db.MissionDebriefs
            .Where(d => d.GoalId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(d => d.IsDeleted, true).SetProperty(d => d.DeletedAt, now));

        goal.IsDeleted = true;
        goal.DeletedAt = now;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(GoalLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(GoalLinkableProvider.Type, id);
        await attachmentsService.RemoveAllForEntityAsync(GoalLinkableProvider.Type, id);

        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<string?> ValidateAsync(GoalRequest request)
    {
        if (request.Title.Trim().Length == 0)
        {
            return "Title is required.";
        }

        if (!await db.LifeAreas.AnyAsync(a => a.Id == request.LifeAreaId))
        {
            return "Life area not found.";
        }

        // Tags go through the per-user filter, so another user's tag id counts as missing.
        var tagIds = request.TagIds.Distinct().ToList();
        if (tagIds.Count > 0 && await db.Tags.CountAsync(t => tagIds.Contains(t.Id)) != tagIds.Count)
        {
            return "Tag not found.";
        }

        return null;
    }

    /// <summary>Names match GoalRequest/Goal properties ("Tags" for the tag set); the UI turns them into labels.</summary>
    private static List<string> ChangedFields(Goal goal, GoalRequest request, bool tagsChanged)
    {
        var changed = new List<string>();
        if (goal.Title != request.Title.Trim())
        {
            changed.Add(nameof(Goal.Title));
        }

        if (goal.Description != (string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim()))
        {
            changed.Add(nameof(Goal.Description));
        }

        if (goal.LifeAreaId != request.LifeAreaId)
        {
            changed.Add(nameof(Goal.LifeArea));
        }

        if (goal.GoalType != request.GoalType)
        {
            changed.Add(nameof(Goal.GoalType));
        }

        if (goal.TargetDate != request.TargetDate)
        {
            changed.Add(nameof(Goal.TargetDate));
        }

        if (tagsChanged)
        {
            changed.Add("Tags");
        }

        return changed;
    }

    private static string? NormalizeNote(string? note) => string.IsNullOrWhiteSpace(note) ? null : note.Trim();

    private static void Apply(Goal goal, GoalRequest request)
    {
        goal.Title = request.Title.Trim();
        goal.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        goal.LifeAreaId = request.LifeAreaId;
        goal.GoalType = request.GoalType;
        goal.TargetDate = request.TargetDate;
    }
}
