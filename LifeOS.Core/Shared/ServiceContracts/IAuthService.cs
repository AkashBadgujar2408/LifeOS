using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Shared.ServiceContracts;

public interface IAuthService
{
    /// <summary>Creates the account and its first set of recovery codes (returned once, in the response).</summary>
    Task<OperationResult<AuthResponse>> RegisterAsync(RegisterRequest request);
    Task<OperationResult<AuthResponse>> LoginAsync(LoginRequest request);

    /// <summary>The logged-in user's password, given the current one.</summary>
    Task<OperationResult<bool>> ChangePasswordAsync(ChangePasswordRequest request);

    /// <summary>A fresh set of recovery codes for the logged-in user (the old set stops working), given the password.</summary>
    Task<OperationResult<RecoveryCodesDto>> RegenerateRecoveryCodesAsync(RegenerateRecoveryCodesRequest request);

    /// <summary>Forgotten password: a username + one unused recovery code sets a new password and logs in. The code is used up.</summary>
    Task<OperationResult<AuthResponse>> ResetPasswordAsync(ResetPasswordRequest request);
}
