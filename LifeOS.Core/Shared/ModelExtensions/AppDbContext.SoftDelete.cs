using System.Linq.Expressions;
using LifeOS.Core.Shared.ModelExtensions;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace LifeOS.Core.Models;

public partial class AppDbContext
{
    private readonly ICurrentUserService? currentUserService;
    private readonly IDataProtector? sensitiveProtector;

    public AppDbContext(DbContextOptions<AppDbContext> options, ICurrentUserService currentUserService,
        IDataProtectionProvider dataProtection)
        : base(options)
    {
        this.currentUserService = currentUserService;
        sensitiveProtector = dataProtection.CreateProtector(SensitiveColumns.Purpose);
    }

    public int? CurrentUserId => currentUserService?.UserId;

    // Every datetime column is stored UTC, but SQL Server's datetime2 carries no kind, so EF materializes
    // DateTimeKind.Unspecified and JSON serializes it without a "Z" — browsers then misread it as local time.
    private static readonly ValueConverter<DateTime, DateTime> UtcConverter =
        new(v => v, v => DateTime.SpecifyKind(v, DateTimeKind.Utc));

    private static readonly ValueConverter<DateTime?, DateTime?> NullableUtcConverter =
        new(v => v, v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : v);

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder)
    {
        foreach (var property in modelBuilder.Model.GetEntityTypes().SelectMany(t => t.GetProperties()))
        {
            if (property.ClrType == typeof(DateTime))
            {
                property.SetValueConverter(UtcConverter);
            }
            else if (property.ClrType == typeof(DateTime?))
            {
                property.SetValueConverter(NullableUtcConverter);
            }
            else if (SensitiveColumns.IsEncrypted(property))
            {
                // The model is built once per process, so this is the first context's protector — the provider is a
                // singleton, so every context would hand over the same one.
                property.SetValueConverter(SensitiveColumns.Converter(sensitiveProtector));
            }
        }

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
