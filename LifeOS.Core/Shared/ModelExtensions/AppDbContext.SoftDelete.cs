using System.Linq.Expressions;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Models;

public partial class AppDbContext
{
    private readonly ICurrentUserService? currentUserService;

    public AppDbContext(DbContextOptions<AppDbContext> options, ICurrentUserService currentUserService)
        : base(options)
    {
        this.currentUserService = currentUserService;
    }

    public int? CurrentUserId => currentUserService?.UserId;

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder)
    {
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            var clrType = entityType.ClrType;
            var isSoftDeletable = typeof(Shared.ModelExtensions.ISoftDeletable).IsAssignableFrom(clrType);
            var isUserOwned = typeof(Shared.ModelExtensions.IUserOwned).IsAssignableFrom(clrType);

            if (!isSoftDeletable && !isUserOwned)
            {
                continue;
            }

            var parameter = Expression.Parameter(clrType, "e");
            Expression? predicate = null;

            if (isSoftDeletable)
            {
                var isDeletedProperty = Expression.Property(parameter, nameof(Shared.ModelExtensions.ISoftDeletable.IsDeleted));
                predicate = Expression.Equal(isDeletedProperty, Expression.Constant(false));
            }

            if (isUserOwned)
            {
                var userIdProperty = Expression.Property(parameter, nameof(Shared.ModelExtensions.IUserOwned.UserId));
                var currentUserIdProperty = Expression.Property(Expression.Constant(this), nameof(CurrentUserId));
                var userMatches = Expression.Equal(Expression.Convert(userIdProperty, typeof(int?)), currentUserIdProperty);
                predicate = predicate is null ? userMatches : Expression.AndAlso(predicate, userMatches);
            }

            var lambda = Expression.Lambda(predicate!, parameter);
            modelBuilder.Entity(clrType).HasQueryFilter(lambda);
        }
    }
}
