using LifeOS.Core.Journal.Services;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Shared.Services;

/// <summary>
/// Fans one query out over every <see cref="ILinkableEntityProvider"/> — the same search the link picker uses, so a
/// new linkable module is searchable with no change here. Providers query through AppDbContext, so only the user's
/// own, non-deleted items come back. They run one after another: a DbContext takes one query at a time.
/// </summary>
public class SearchService(AppDbContext db, IEnumerable<ILinkableEntityProvider> providers) : ISearchService
{
    public const int MinQueryLength = 2;
    public const int MaxQueryLength = 100;
    public const int PerType = 5;

    // The order groups appear in; a provider not listed (a later module) follows, by display name.
    private static readonly string[] TypeOrder = ["Goal", "Task", "Project", "Event", "Habit", "JournalEntry", "InboxItem"];

    public async Task<OperationResult<List<SearchGroupDto>>> SearchAsync(string? query)
    {
        var q = query?.Trim() ?? string.Empty;
        if (q.Length < MinQueryLength)
        {
            return OperationResult<List<SearchGroupDto>>.Ok([]);
        }

        if (q.Length > MaxQueryLength)
        {
            return OperationResult<List<SearchGroupDto>>.Fail($"Search for at most {MaxQueryLength} characters.");
        }

        // Switched-off modules stay out of search (Session 97a).
        var hidden = (await db.UserHiddenModules.Select(m => m.ModuleKey).ToListAsync()).ToHashSet(StringComparer.Ordinal);
        var ordered = providers
            .Where(p => LinkableModules.IsVisible(p.EntityType, hidden))
            .OrderBy(p => Array.IndexOf(TypeOrder, p.EntityType) is var i and >= 0 ? i : int.MaxValue)
            .ThenBy(p => p.DisplayName, StringComparer.Ordinal);

        var groups = new List<SearchGroupDto>();
        foreach (var provider in ordered)
        {
            // One extra tells "exactly five" from "more than five".
            var found = await provider.SearchAsync(q, PerType + 1);
            if (found.Count == 0)
            {
                continue;
            }

            var items = found.Take(PerType).Select(f => new SearchResultDto
            {
                EntityType = f.EntityType,
                EntityId = f.EntityId,
                Title = f.Title,
            }).ToList();

            if (provider.EntityType == JournalEntryLinkableProvider.Type)
            {
                items = await WithJournalSnippetsAsync(items, q);
            }

            groups.Add(new SearchGroupDto
            {
                EntityType = provider.EntityType,
                DisplayName = provider.DisplayName,
                Items = items,
                HasMore = found.Count > PerType,
            });
        }

        return OperationResult<List<SearchGroupDto>>.Ok(groups);
    }

    /// <summary>A journal entry's title is mostly its date, so show where in the text the words were found.</summary>
    private async Task<List<SearchResultDto>> WithJournalSnippetsAsync(List<SearchResultDto> items, string q)
    {
        var ids = items.Select(i => i.EntityId).ToList();
        var contents = await db.JournalEntries
            .Where(e => ids.Contains(e.Id))
            .ToDictionaryAsync(e => e.Id, e => e.Content);

        return items.Select(i => new SearchResultDto
        {
            EntityType = i.EntityType,
            EntityId = i.EntityId,
            Title = i.Title,
            Snippet = SearchSnippets.Around(contents.GetValueOrDefault(i.EntityId), q),
        }).ToList();
    }
}

/// <summary>Pure text helper for search results (xUnit-tested).</summary>
public static class SearchSnippets
{
    /// <summary>
    /// About <paramref name="length"/> characters of <paramref name="text"/> around the first case-insensitive match of
    /// <paramref name="query"/>, on one line, with whole words and "…" where text was left out. With no match (the
    /// words were in the title) it's the start of the text; null for no text.
    /// </summary>
    public static string? Around(string? text, string query, int length = 120)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        var flat = string.Join(' ', text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        if (flat.Length <= length)
        {
            return flat;
        }

        var needle = query.Trim();
        var match = flat.IndexOf(needle, StringComparison.OrdinalIgnoreCase);
        var matchEnd = match < 0 ? 0 : match + needle.Length;

        // The match about a third of the way in: some lead-in, most of the room after it.
        var start = match < 0 ? 0 : Math.Max(0, match - length / 3);
        var end = Math.Min(flat.Length, start + length);
        start = Math.Max(0, end - length);

        // Whole words: start at the beginning of the word it lands in, end before a word it would cut — never
        // cutting into the match itself.
        if (start > 0)
        {
            start = flat.LastIndexOf(' ', start - 1) + 1;
        }

        if (end < flat.Length && flat[end] != ' ')
        {
            var space = flat.LastIndexOf(' ', end - 1);
            if (space > matchEnd)
            {
                end = space;
            }
        }

        return (start > 0 ? "…" : string.Empty) + flat[start..end].Trim() + (end < flat.Length ? "…" : string.Empty);
    }
}
