using System.Data.Common;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;

namespace LifeOS.Core.Shared.Services;

/// <summary>
/// Lets a service that needs a transaction run on its own or inside a caller's: when one is already open on the
/// context (a purchase creating its asset, warranty and expense together), the service joins it and its commit/rollback
/// do nothing — the outer one decides. On its own it begins (and owns) a new transaction, exactly as before.
/// </summary>
public static class DbTransactions
{
    public static async Task<IDbContextTransaction> BeginOrJoinTransactionAsync(this DatabaseFacade database) =>
        database.CurrentTransaction is { } current ? new Joined(current) : await database.BeginTransactionAsync();

    /// <summary>The caller's transaction, seen from inside: committing, rolling back or disposing it is the caller's job.</summary>
    private sealed class Joined(IDbContextTransaction outer) : IDbContextTransaction
    {
        public Guid TransactionId => outer.TransactionId;

        public void Commit() { }

        public Task CommitAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;

        public void Rollback() { }

        public Task RollbackAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;

        public void Dispose() { }

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;

        public DbTransaction? GetDbTransaction() => outer.GetDbTransaction();
    }
}
