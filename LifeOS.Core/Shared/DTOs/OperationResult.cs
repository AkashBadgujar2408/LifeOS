namespace LifeOS.Core.Shared.DTOs;

public record OperationResult<T>(bool Success, T? Data, string? Error)
{
    public static OperationResult<T> Ok(T data) => new(true, data, null);
    public static OperationResult<T> Fail(string error) => new(false, default, error);
}
