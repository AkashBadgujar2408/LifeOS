using LifeOS.Core.Habits.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Habits.ServiceContracts;

public interface IHabitsService
{
    /// <summary>
    /// Every habit (any status) with its streak as of <paramref name="today"/> and the days done from
    /// <paramref name="from"/> to today; the client filters by status.
    /// </summary>
    Task<OperationResult<List<HabitDto>>> GetAllAsync(DateOnly today, DateOnly from);
    Task<OperationResult<HabitDto>> GetAsync(int id, DateOnly today, DateOnly from);
    Task<OperationResult<HabitDto>> CreateAsync(HabitRequest request, DateOnly today);
    Task<OperationResult<HabitDto>> UpdateAsync(int id, HabitRequest request, DateOnly today);
    Task<OperationResult<HabitDto>> SetStatusAsync(int id, string status, DateOnly today);

    /// <summary>
    /// Ticks (done) or un-ticks a day — for a measurable habit, logs a value (the target when none is given); for an
    /// avoid habit, logs or removes a slip. Ticking twice, or un-ticking a day that wasn't done, changes nothing.
    /// </summary>
    Task<OperationResult<HabitEntryResultDto>> SetEntryAsync(int id, DateOnly date, bool done, decimal? value, DateOnly today);

    /// <summary>Deletes the habit with its ticked days, links and reminders.</summary>
    Task<OperationResult<bool>> DeleteAsync(int id);
}
