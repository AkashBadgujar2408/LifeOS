using LifeOS.Core.Goals.DTOs;
using LifeOS.Core.Goals.Services;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.Services;
using LifeOS.Core.Story.DTOs;
using LifeOS.Core.Story.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Story.Services;

/// <summary>
/// Goals seen as missions. Reads the user's goals, objectives, prerequisite edges and debriefs in a few small EF
/// queries (the global filters scope them), and works out kinds, progress and locks through the pure helpers
/// (MissionKinds, GoalProgress, MissionGraph) — nothing here is stored except edges and debriefs.
/// </summary>
public class MissionsService(AppDbContext db) : IMissionsService
{
    private const string NotFound = MissionErrors.NotFound;

    public async Task<List<MissionDto>> ListAsync()
    {
        var snapshot = await LoadAsync();
        return snapshot.Goals.Values
            .OrderBy(g => g.CreatedAt)
            .Select(g => ToMission(g, snapshot))
            .ToList();
    }

    public async Task<OperationResult<MissionDto>> GetAsync(int goalId)
    {
        var snapshot = await LoadAsync();
        return snapshot.Goals.TryGetValue(goalId, out var goal)
            ? OperationResult<MissionDto>.Ok(ToMission(goal, snapshot))
            : OperationResult<MissionDto>.Fail(NotFound);
    }

    public async Task<OperationResult<MissionDto>> AddPrerequisiteAsync(int goalId, int requiresGoalId)
    {
        var snapshot = await LoadAsync();
        if (!snapshot.Goals.ContainsKey(goalId))
        {
            return OperationResult<MissionDto>.Fail(NotFound);
        }

        if (!snapshot.Goals.TryGetValue(requiresGoalId, out var required))
        {
            return OperationResult<MissionDto>.Fail("The mission to come first wasn't found.");
        }

        if (goalId == requiresGoalId)
        {
            return OperationResult<MissionDto>.Fail("A mission can't need itself.");
        }

        if (snapshot.Edges.Contains((goalId, requiresGoalId)))
        {
            return OperationResult<MissionDto>.Fail($"It already needs \"{required.Title}\".");
        }

        if (MissionGraph.WouldCreateCycle(snapshot.Edges, goalId, requiresGoalId))
        {
            return OperationResult<MissionDto>.Fail(
                $"\"{required.Title}\" already depends on this mission, so it can't also come first — that would be a loop.");
        }

        db.MissionPrerequisites.Add(new MissionPrerequisite
        {
            UserId = db.CurrentUserId!.Value,
            GoalId = goalId,
            RequiresGoalId = requiresGoalId,
        });
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            // A double-click: the same edge saved twice. Already in place, so treat it as done.
            db.ChangeTracker.Clear();
        }

        return await GetAsync(goalId);
    }

    public async Task<OperationResult<MissionDto>> RemovePrerequisiteAsync(int goalId, int requiresGoalId)
    {
        var edge = await db.MissionPrerequisites.FirstOrDefaultAsync(p => p.GoalId == goalId && p.RequiresGoalId == requiresGoalId);
        if (edge is null)
        {
            return OperationResult<MissionDto>.Fail(NotFound);
        }

        edge.IsDeleted = true;
        edge.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(goalId);
    }

    public async Task<OperationResult<MissionPassedDto>> GetPassedAsync(int goalId)
    {
        var snapshot = await LoadAsync();
        if (!snapshot.Goals.TryGetValue(goalId, out var goal))
        {
            return OperationResult<MissionPassedDto>.Fail(NotFound);
        }

        if (goal.Status != GoalStatuses.Completed)
        {
            return OperationResult<MissionPassedDto>.Fail("This mission hasn't been passed yet.");
        }

        var unlocked = MissionGraph.UnlockedBy(goalId, snapshot.Edges, snapshot.StatusById)
            .Select(id => Ref(snapshot.Goals[id]))
            .ToList();

        return OperationResult<MissionPassedDto>.Ok(new MissionPassedDto
        {
            Mission = ToMission(goal, snapshot),
            NowUnlocked = unlocked,
            Debrief = await GetDebriefDtoAsync(goalId),
        });
    }

    public async Task<OperationResult<MissionDebriefDto?>> SaveDebriefAsync(int goalId, MissionDebriefRequest request)
    {
        var goal = await db.Goals.FirstOrDefaultAsync(g => g.Id == goalId);
        if (goal is null)
        {
            return OperationResult<MissionDebriefDto?>.Fail(NotFound);
        }

        if (goal.Status != GoalStatuses.Completed)
        {
            return OperationResult<MissionDebriefDto?>.Fail("A debrief is written once the mission is passed.");
        }

        var howItWent = Normalize(request.HowItWent);
        var advice = Normalize(request.AdviceToPastSelf);
        var debrief = await db.MissionDebriefs.FirstOrDefaultAsync(d => d.GoalId == goalId);
        var now = DateTime.UtcNow;

        if (howItWent is null && advice is null)
        {
            // Both prompts cleared: there's no debrief any more.
            if (debrief is not null)
            {
                debrief.IsDeleted = true;
                debrief.DeletedAt = now;
                await db.SaveChangesAsync();
            }

            return OperationResult<MissionDebriefDto?>.Ok(null);
        }

        // One debrief per goal, rewritten in place (EF models Goal.MissionDebrief as one-to-one — never insert a second).
        if (debrief is null)
        {
            debrief = new MissionDebrief { UserId = goal.UserId, GoalId = goalId };
            db.MissionDebriefs.Add(debrief);
        }
        else
        {
            debrief.UpdatedAt = now;
        }

        debrief.HowItWent = howItWent;
        debrief.AdviceToPastSelf = advice;
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<MissionDebriefDto?>.Fail("The debrief was just saved from somewhere else — reload and try again.");
        }

        return OperationResult<MissionDebriefDto?>.Ok(await GetDebriefDtoAsync(goalId));
    }

    private async Task<MissionDebriefDto?> GetDebriefDtoAsync(int goalId) =>
        await db.MissionDebriefs
            .Where(d => d.GoalId == goalId)
            .Select(d => new MissionDebriefDto
            {
                GoalId = d.GoalId,
                HowItWent = d.HowItWent,
                AdviceToPastSelf = d.AdviceToPastSelf,
                CreatedAt = d.CreatedAt,
                UpdatedAt = d.UpdatedAt,
            })
            .FirstOrDefaultAsync();

    private static string? Normalize(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();

    private async Task<Snapshot> LoadAsync()
    {
        var goals = await db.Goals
            .Select(g => new GoalRow(g.Id, g.Title, g.GoalType, g.Status, g.LifeArea.Name, g.TargetDate, g.CreatedAt, g.CompletedAt))
            .ToDictionaryAsync(g => g.Id);

        var objectives = (await db.GoalMilestones
                .OrderBy(m => m.SortOrder).ThenBy(m => m.Id)
                .Select(m => new { m.GoalId, Objective = new MissionObjectiveDto { Id = m.Id, Title = m.Title, Done = m.CompletedAt != null, TargetDate = m.TargetDate } })
                .ToListAsync())
            .GroupBy(x => x.GoalId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.Objective).ToList());

        // Edges whose either end has been deleted are ignored (goal delete soft-deletes them anyway).
        var edges = (await db.MissionPrerequisites.Select(p => new { p.GoalId, p.RequiresGoalId }).ToListAsync())
            .Select(p => (p.GoalId, p.RequiresGoalId))
            .Where(e => goals.ContainsKey(e.GoalId) && goals.ContainsKey(e.RequiresGoalId))
            .ToHashSet();

        var debriefed = (await db.MissionDebriefs.Select(d => d.GoalId).ToListAsync()).ToHashSet();

        return new Snapshot(goals, objectives, edges, debriefed, goals.ToDictionary(g => g.Key, g => g.Value.Status));
    }

    private static MissionDto ToMission(GoalRow goal, Snapshot s)
    {
        var objectives = s.Objectives.GetValueOrDefault(goal.Id) ?? [];
        return new MissionDto
        {
            Id = goal.Id,
            Title = goal.Title,
            Kind = MissionKinds.Of(goal.GoalType),
            Status = goal.Status,
            LifeAreaName = goal.LifeAreaName,
            TargetDate = goal.TargetDate,
            CreatedAt = DateTime.SpecifyKind(goal.CreatedAt, DateTimeKind.Utc),
            CompletedAt = goal.CompletedAt is { } done ? DateTime.SpecifyKind(done, DateTimeKind.Utc) : null,
            ProgressPercent = GoalProgress.Percent(goal.Status, objectives.Count, objectives.Count(o => o.Done)),
            Objectives = objectives,
            Prerequisites = s.Edges.Where(e => e.GoalId == goal.Id).Select(e => Ref(s.Goals[e.RequiresGoalId])).OrderBy(r => r.Title).ToList(),
            BlockedBy = MissionGraph.BlockedBy(goal.Id, s.Edges, s.StatusById).Select(id => Ref(s.Goals[id])).OrderBy(r => r.Title).ToList(),
            Unlocks = s.Edges.Where(e => e.RequiresGoalId == goal.Id).Select(e => Ref(s.Goals[e.GoalId])).OrderBy(r => r.Title).ToList(),
            HasDebrief = s.Debriefed.Contains(goal.Id),
        };
    }

    private static MissionRefDto Ref(GoalRow goal) =>
        new() { Id = goal.Id, Title = goal.Title, Status = goal.Status, Kind = MissionKinds.Of(goal.GoalType) };

    private sealed record GoalRow(int Id, string Title, string GoalType, string Status, string LifeAreaName,
        DateOnly? TargetDate, DateTime CreatedAt, DateTime? CompletedAt);

    private sealed record Snapshot(
        Dictionary<int, GoalRow> Goals,
        Dictionary<int, List<MissionObjectiveDto>> Objectives,
        HashSet<(int GoalId, int RequiresGoalId)> Edges,
        HashSet<int> Debriefed,
        Dictionary<int, string> StatusById);
}
