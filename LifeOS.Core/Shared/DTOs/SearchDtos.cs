namespace LifeOS.Core.Shared.DTOs;

/// <summary>Search results for one kind of item (goals, tasks, ...), in the order the palette shows them.</summary>
public class SearchGroupDto
{
    public string EntityType { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    public List<SearchResultDto> Items { get; init; } = [];
    /// <summary>More matched than are listed; the palette says to keep typing.</summary>
    public bool HasMore { get; init; }
}

public class SearchResultDto
{
    public string EntityType { get; init; } = string.Empty;
    public int EntityId { get; init; }
    public string Title { get; init; } = string.Empty;
    /// <summary>Journal entries: the words around the match in the entry's text; null otherwise.</summary>
    public string? Snippet { get; init; }
}
