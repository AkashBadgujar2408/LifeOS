using LifeOS.Core.Habits.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Habits.ServiceContracts;

/// <summary>Routines: ordered groups of build habits, ticked together (My Day).</summary>
public interface IRoutinesService
{
    Task<List<RoutineDto>> ListAsync();
    Task<OperationResult<RoutineDto>> CreateAsync(RoutineRequest request);

    /// <summary>Renames it and replaces its habits (in the order given).</summary>
    Task<OperationResult<RoutineDto>> UpdateAsync(int id, RoutineRequest request);

    /// <summary>Deletes the routine only; its habits stay.</summary>
    Task<OperationResult<bool>> DeleteAsync(int id);

    /// <summary>
    /// Ticks every habit in the routine that's due on <paramref name="date"/> and not done yet (a measurable one logs its
    /// target), or un-ticks those that are done; the rest are reported as skipped.
    /// </summary>
    Task<OperationResult<RoutineTickResultDto>> SetDoneAsync(int id, DateOnly date, bool done, DateOnly today);
}
