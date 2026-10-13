namespace LifeOS.Core.Shared.ServiceContracts;

public interface ICurrentUserService
{
    int? UserId { get; }
    bool IsAuthenticated { get; }
}
