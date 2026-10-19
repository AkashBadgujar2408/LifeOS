using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Shared.ServiceContracts;

/// <summary>
/// Data portability and permanent deletion (Blueprint principle 9, Session 60): everything a user has, out as one zip
/// (JSON + CSV per table, files included) and back in to an empty account; and the account erased for good.
/// </summary>
public interface IAccountDataService
{
    /// <summary>Writes the current user's export (a zip) to <paramref name="output"/>.</summary>
    Task<OperationResult<bool>> ExportAsync(Stream output, CancellationToken cancellationToken = default);

    /// <summary>Reads an export into the current user's account, which must be empty — all or nothing.</summary>
    Task<OperationResult<ImportSummaryDto>> ImportAsync(Stream zip, CancellationToken cancellationToken = default);

    /// <summary>Hard-deletes every row and file of the current user, then the user. The one exception to soft delete.</summary>
    Task<OperationResult<bool>> DeleteAccountAsync(DeleteAccountRequest request);
}
