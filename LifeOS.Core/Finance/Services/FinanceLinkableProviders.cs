using System.Globalization;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Finance.Services;

/// <summary>Accounts can be linked, have reminders and be found by search (name or institution).</summary>
public class AccountLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "FinanceAccount";

    public string EntityType => Type;

    public string DisplayName => "Account";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.Accounts.Where(a => ids.Contains(a.Id)).ToDictionaryAsync(a => a.Id, a => a.Name);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Accounts.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(a => a.Name.Contains(search) || (a.Institution != null && a.Institution.Contains(search)));
        }

        return await query
            .OrderBy(a => a.IsArchived).ThenBy(a => a.Name)
            .Take(take)
            .Select(a => new LinkableItemDto { EntityType = Type, EntityId = a.Id, Title = a.Name })
            .ToListAsync();
    }
}

/// <summary>
/// Transactions take receipts (attachments), links and reminders, and can be found by payee, note or reference.
/// Titled "Payee · 1,250.00 INR · 18/Oct/2026" so search results tell them apart.
/// </summary>
public class TransactionLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "Transaction";

    public string EntityType => Type;

    public string DisplayName => "Transaction";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        (await db.Transactions.Where(t => ids.Contains(t.Id)).Select(t => new TitleRow(t.Id, t.Kind, t.Payee, t.Note, t.Amount, t.Currency, t.OccurredOn))
            .ToListAsync())
        .ToDictionary(r => r.Id, Title);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.Transactions.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(t =>
                (t.Payee != null && t.Payee.Contains(search))
                || (t.Note != null && t.Note.Contains(search))
                || (t.Reference != null && t.Reference.Contains(search)));
        }

        var rows = await query
            .OrderByDescending(t => t.OccurredOn).ThenByDescending(t => t.Id)
            .Take(take)
            .Select(t => new TitleRow(t.Id, t.Kind, t.Payee, t.Note, t.Amount, t.Currency, t.OccurredOn))
            .ToListAsync();
        return rows.Select(r => new LinkableItemDto { EntityType = Type, EntityId = r.Id, Title = Title(r) }).ToList();
    }

    private sealed record TitleRow(int Id, string Kind, string? Payee, string? Note, decimal Amount, string Currency, DateOnly OccurredOn);

    private static string Title(TitleRow r)
    {
        var what = r.Payee ?? (r.Note is { Length: > 60 } note ? note[..60] + "…" : r.Note) ?? r.Kind;
        return string.Create(CultureInfo.InvariantCulture,
            $"{what} · {r.Amount:#,0.00} {r.Currency} · {r.OccurredOn.ToString("dd'/'MMM'/'yyyy", CultureInfo.InvariantCulture)}");
    }
}
