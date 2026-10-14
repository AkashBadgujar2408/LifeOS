using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Shared.Services;

public static class DbUpdateExceptionExtensions
{
    private const int SqlUniqueConstraintViolation = 2627;
    private const int SqlUniqueIndexViolation = 2601;

    // Safety net for check-then-insert races on unique business constraints (see CLAUDE.md).
    public static bool IsUniqueConstraintViolation(this DbUpdateException ex) =>
        ex.InnerException is SqlException sqlEx &&
        (sqlEx.Number == SqlUniqueConstraintViolation || sqlEx.Number == SqlUniqueIndexViolation);
}
