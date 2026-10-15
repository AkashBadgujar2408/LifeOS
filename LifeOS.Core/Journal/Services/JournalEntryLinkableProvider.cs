using System.Globalization;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Journal.Services;

/// <summary>Lets a journal entry be linked to what it was about (a goal, an event, a habit...).</summary>
public class JournalEntryLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "JournalEntry";

    public string EntityType => Type;

    public string DisplayName => "Journal entry";

    /// <summary>"15/Oct/2026 · Title" — the date is what identifies an entry; the title is optional.</summary>
    public static string DisplayTitle(DateOnly entryDate, string? title)
    {
        // The app's one date format (14/Oct/2026); quoted slashes + invariant culture so the server's locale can't
        // swap in its own separator or month names.
        var date = entryDate.ToString("dd'/'MMM'/'yyyy", CultureInfo.InvariantCulture);
        return string.IsNullOrWhiteSpace(title) ? date : $"{date} · {title}";
    }

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        (await db.JournalEntries
            .Where(e => ids.Contains(e.Id))
            .Select(e => new { e.Id, e.EntryDate, e.Title })
            .ToListAsync())
        .ToDictionary(e => e.Id, e => DisplayTitle(e.EntryDate, e.Title));

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.JournalEntries.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(e => (e.Title != null && e.Title.Contains(search)) ||
                                     (e.Content != null && e.Content.Contains(search)));
        }

        // Newest first: recent entries are what you'd usually link.
        var entries = await query
            .OrderByDescending(e => e.EntryDate)
            .Take(take)
            .Select(e => new { e.Id, e.EntryDate, e.Title })
            .ToListAsync();

        return entries
            .Select(e => new LinkableItemDto { EntityType = Type, EntityId = e.Id, Title = DisplayTitle(e.EntryDate, e.Title) })
            .ToList();
    }
}
