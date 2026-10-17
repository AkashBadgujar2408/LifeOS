using LifeOS.Core.Habits.DTOs;
using LifeOS.Core.Habits.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Habits.Services;

public class RoutinesService(AppDbContext db, IHabitsService habitsService) : IRoutinesService
{
    private const string NotFound = RoutineErrors.NotFound;
    private const string DuplicateName = "You already have a routine with this name.";
    private const int MaxHabits = 20;

    public async Task<List<RoutineDto>> ListAsync() =>
        await db.Routines.AsNoTracking()
            .OrderBy(r => r.SortOrder).ThenBy(r => r.Name)
            .Select(r => new RoutineDto
            {
                Id = r.Id,
                Name = r.Name,
                SortOrder = r.SortOrder,
                // The navigation goes through the user + soft-delete filters too, so removed habits drop out.
                HabitIds = r.RoutineHabits.Where(h => !h.Habit.IsDeleted).OrderBy(h => h.SortOrder).Select(h => h.HabitId).ToList(),
            })
            .ToListAsync();

    public async Task<OperationResult<RoutineDto>> CreateAsync(RoutineRequest request)
    {
        var error = await ValidateAsync(request, null);
        if (error is not null)
        {
            return OperationResult<RoutineDto>.Fail(error);
        }

        var userId = db.CurrentUserId!.Value;
        var routine = new Routine
        {
            UserId = userId,
            Name = request.Name.Trim(),
            SortOrder = await db.Routines.CountAsync(),
        };
        var order = 0;
        foreach (var habitId in request.HabitIds.Distinct())
        {
            routine.RoutineHabits.Add(new RoutineHabit { UserId = userId, HabitId = habitId, SortOrder = order++ });
        }

        db.Routines.Add(routine);
        return await SaveAsync(routine);
    }

    public async Task<OperationResult<RoutineDto>> UpdateAsync(int id, RoutineRequest request)
    {
        var routine = await db.Routines.Include(r => r.RoutineHabits).FirstOrDefaultAsync(r => r.Id == id);
        if (routine is null)
        {
            return OperationResult<RoutineDto>.Fail(NotFound);
        }

        var error = await ValidateAsync(request, id);
        if (error is not null)
        {
            return OperationResult<RoutineDto>.Fail(error);
        }

        var now = DateTime.UtcNow;
        routine.Name = request.Name.Trim();
        routine.UpdatedAt = now;

        // Order changes are rewritten in place; habits taken out are soft-deleted, new ones added.
        var wanted = request.HabitIds.Distinct().ToList();
        foreach (var place in routine.RoutineHabits.Where(p => !wanted.Contains(p.HabitId)))
        {
            place.IsDeleted = true;
            place.DeletedAt = now;
        }

        for (var i = 0; i < wanted.Count; i++)
        {
            var place = routine.RoutineHabits.FirstOrDefault(p => p.HabitId == wanted[i] && !p.IsDeleted);
            if (place is null)
            {
                routine.RoutineHabits.Add(new RoutineHabit { UserId = routine.UserId, HabitId = wanted[i], SortOrder = i });
            }
            else if (place.SortOrder != i)
            {
                place.SortOrder = i;
                place.UpdatedAt = now;
            }
        }

        return await SaveAsync(routine);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var routine = await db.Routines.Include(r => r.RoutineHabits).FirstOrDefaultAsync(r => r.Id == id);
        if (routine is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        routine.IsDeleted = true;
        routine.DeletedAt = now;
        foreach (var place in routine.RoutineHabits)
        {
            place.IsDeleted = true;
            place.DeletedAt = now;
        }

        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task<OperationResult<RoutineTickResultDto>> SetDoneAsync(int id, DateOnly date, bool done, DateOnly today)
    {
        var routine = (await ListAsync()).FirstOrDefault(r => r.Id == id);
        if (routine is null)
        {
            return OperationResult<RoutineTickResultDto>.Fail(NotFound);
        }

        if (date > today)
        {
            return OperationResult<RoutineTickResultDto>.Fail("That day hasn't happened yet.");
        }

        var habits = await db.Habits.AsNoTracking()
            .Where(h => routine.HabitIds.Contains(h.Id))
            .Select(h => new { h.Id, h.Status, h.Kind, h.StartDate, h.ScheduleDays, h.TargetValue })
            .ToDictionaryAsync(h => h.Id);
        var logged = await db.HabitEntries.AsNoTracking()
            .Where(e => routine.HabitIds.Contains(e.HabitId) && e.EntryDate == date)
            .ToDictionaryAsync(e => e.HabitId, e => e.Value);

        var result = new RoutineTickResultDto();
        foreach (var habitId in routine.HabitIds)
        {
            var habit = habits.GetValueOrDefault(habitId);
            var isDone = habit is not null && logged.TryGetValue(habitId, out var value) && HabitStreaks.IsMet(value, habit.TargetValue);
            var due = habit is not null && habit.Status == HabitStatuses.Active && habit.Kind == HabitKinds.Build
                      && date >= habit.StartDate && HabitStreaks.IsScheduled(habit.ScheduleDays, date);
            if (!due || isDone == done)
            {
                result.Skipped.Add(habitId);
                continue;
            }

            var tick = await habitsService.SetEntryAsync(habitId, date, done, null, today);
            if (!tick.Success)
            {
                return OperationResult<RoutineTickResultDto>.Fail(tick.Error!);
            }

            result.Results.Add(new RoutineHabitResultDto { HabitId = habitId, Result = tick.Data! });
        }

        return OperationResult<RoutineTickResultDto>.Ok(result);
    }

    private async Task<string?> ValidateAsync(RoutineRequest request, int? id)
    {
        var name = request.Name.Trim();
        if (name.Length == 0)
        {
            return "Give the routine a name.";
        }

        if (await db.Routines.AnyAsync(r => r.Name == name && r.Id != id))
        {
            return DuplicateName;
        }

        var habitIds = request.HabitIds.Distinct().ToList();
        if (habitIds.Count == 0)
        {
            return "Add at least one habit to the routine.";
        }

        if (habitIds.Count > MaxHabits)
        {
            return $"A routine can hold up to {MaxHabits} habits.";
        }

        // Through the per-user filter: another user's habit counts as missing.
        var kinds = await db.Habits.Where(h => habitIds.Contains(h.Id)).Select(h => h.Kind).ToListAsync();
        if (kinds.Count != habitIds.Count)
        {
            return "Habit not found.";
        }

        return kinds.Any(k => k != HabitKinds.Build)
            ? "Habits you're breaking can't be in a routine — routines are things you do."
            : null;
    }

    private async Task<OperationResult<RoutineDto>> SaveAsync(Routine routine)
    {
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<RoutineDto>.Fail(DuplicateName);
        }

        return OperationResult<RoutineDto>.Ok((await ListAsync()).First(r => r.Id == routine.Id));
    }
}
