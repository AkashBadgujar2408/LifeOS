using LifeOS.Core.Family.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Family.ServiceContracts;

/// <summary>The family tree's edges and the people directory (Session 73).</summary>
public interface IRelationshipsService
{
    Task<List<RelationshipDto>> GetAllAsync();

    /// <summary>Every contact, A–Z, with their place in the tree and next birthday.</summary>
    Task<List<FamilyPersonDto>> GetPeopleAsync(DateOnly today);

    Task<OperationResult<RelationshipDto>> CreateAsync(RelationshipRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);
}

/// <summary>Birthdays, anniversaries and other days that come round every year (Session 73).</summary>
public interface ISignificantDatesService
{
    /// <summary>Every date, next one first.</summary>
    Task<List<SignificantDateDto>> GetAllAsync(DateOnly today);

    Task<OperationResult<SignificantDateDto>> CreateAsync(SignificantDateRequest request);
    Task<OperationResult<SignificantDateDto>> UpdateAsync(int id, SignificantDateRequest request);
    Task<OperationResult<bool>> DeleteAsync(int id);

    /// <summary>What comes round from today to today + <paramref name="days"/> (My Day: a week ahead).</summary>
    Task<List<UpcomingDayDto>> UpcomingAsync(DateOnly today, int days);
}
