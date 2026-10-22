using LifeOS.Core.Reports.DTOs;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Reports.ServiceContracts;

public interface IAnnualReviewService
{
    /// <summary>
    /// The Annual Life Review for <paramref name="year"/> (Jan 1 – Dec 31, never later than <paramref name="today"/>'s
    /// year), moments put on days in <paramref name="timeZone"/> (an IANA id from the browser).
    /// </summary>
    Task<OperationResult<AnnualReviewDto>> GetAsync(int year, DateOnly today, string? timeZone);
}
