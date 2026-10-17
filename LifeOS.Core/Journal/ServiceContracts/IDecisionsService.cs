using LifeOS.Core.Journal.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Journal.ServiceContracts;

/// <summary>The decision journal. Which decisions are due for review is worked out by the client (its local today).</summary>
public interface IDecisionsService
{
    /// <summary>All decisions, newest first, or only those made on <paramref name="day"/>.</summary>
    Task<List<DecisionDto>> ListAsync(DateOnly? day);

    Task<OperationResult<DecisionDto>> GetAsync(int id);

    /// <summary>Saves the decision and keeps its review reminder in step with ReviewOn.</summary>
    Task<OperationResult<DecisionDto>> CreateAsync(DecisionRequest request);

    Task<OperationResult<DecisionDto>> UpdateAsync(int id, DecisionRequest request);

    /// <summary>Records (or, blank, clears) what actually happened; a recorded outcome settles the review reminder.</summary>
    Task<OperationResult<DecisionDto>> RecordOutcomeAsync(int id, DecisionOutcomeRequest request);

    /// <summary>Soft-deletes the decision with its links and reminders.</summary>
    Task<OperationResult<bool>> DeleteAsync(int id);
}
