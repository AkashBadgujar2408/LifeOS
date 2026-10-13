using LifeOS.Core.Models;

namespace LifeOS.Core.Shared.ServiceContracts;

public interface IJwtTokenService
{
    (string Token, DateTime ExpiresAtUtc) GenerateToken(User user);
}
