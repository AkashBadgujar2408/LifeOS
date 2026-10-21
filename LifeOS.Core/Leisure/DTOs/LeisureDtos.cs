using System.ComponentModel.DataAnnotations;
using LifeOS.Core.Shared.DTOs;

namespace LifeOS.Core.Leisure.DTOs;

/// <summary>What a media item is (mirrors <c>CK_MediaItems_Kind</c>). Books came over from Learning in Session 78a.</summary>
public static class MediaKinds
{
    public const string Book = "Book";
    public const string Film = "Film";
    public const string Series = "Series";
    public const string Game = "Game";
    public const string Album = "Album";
    public const string Podcast = "Podcast";
    public const string Other = "Other";

    public static readonly IReadOnlyList<string> All = [Book, Film, Series, Game, Album, Podcast, Other];

    /// <summary>Kinds that count episodes (a podcast has episodes but no seasons).</summary>
    public static bool HasEpisodes(string kind) => kind is Series or Podcast;
}

/// <summary>Where an item stands (mirrors <c>CK_MediaItems_Status</c>).</summary>
public static class MediaStatuses
{
    public const string Want = "Want";
    public const string InProgress = "InProgress";
    public const string Finished = "Finished";
    public const string Dropped = "Dropped";
}

public static class MediaNoteKinds
{
    public const string Note = "Note";
    public const string Highlight = "Highlight";
}

public static class HobbyStatuses
{
    public const string Active = "Active";
    public const string Archived = "Archived";
}

// ---- Media items ----

public class MediaItemDto
{
    public int Id { get; init; }
    public string Kind { get; init; } = MediaKinds.Other;
    public string Title { get; init; } = string.Empty;
    public string? Creator { get; init; }
    public string? WhereToFind { get; init; }
    public string Status { get; init; } = MediaStatuses.Want;
    public bool UpNext { get; init; }
    public int? TotalPages { get; init; }
    public int CurrentPage { get; init; }
    public short? Season { get; init; }
    public short? Episode { get; init; }
    /// <summary>Worked out by the API (<c>LeisureRules.Percent</c>): a book's pages, 100 when finished, else null.</summary>
    public int? ProgressPercent { get; set; }
    public DateOnly? StartedOn { get; init; }
    public DateOnly? FinishedOn { get; init; }
    public byte? Rating { get; init; }
    public string? Review { get; init; }
    public int? SkillId { get; init; }
    public string? SkillName { get; init; }
    public int? LifeAreaId { get; init; }
    public string? LifeAreaName { get; init; }
    public List<TagDto> Tags { get; init; } = [];
    public int NoteCount { get; init; }
    /// <summary>Watches / plays / listens logged, and the minutes they add up to (logs without a length add none).</summary>
    public int LogCount { get; init; }
    public int MinutesLogged { get; init; }
}

public class MediaItemDetailDto : MediaItemDto
{
    /// <summary>Notes and highlights, by page (unpaged ones last), then oldest first.</summary>
    public List<MediaNoteDto> Notes { get; init; } = [];
    /// <summary>Logged watches / plays / listens, newest first.</summary>
    public List<MediaLogDto> Logs { get; init; } = [];
}

public class MediaNoteDto
{
    public int Id { get; init; }
    public string Kind { get; init; } = MediaNoteKinds.Note;
    public string Text { get; init; } = string.Empty;
    public int? Page { get; init; }
    public DateTime CreatedAt { get; init; }
}

public class MediaLogDto
{
    public int Id { get; init; }
    public DateOnly LoggedOn { get; init; }
    public int? Minutes { get; init; }
    public string? Note { get; init; }
}

public class MediaItemRequest
{
    [Required]
    [AllowedValues(MediaKinds.Book, MediaKinds.Film, MediaKinds.Series, MediaKinds.Game, MediaKinds.Album,
        MediaKinds.Podcast, MediaKinds.Other, ErrorMessage = "Kind must be Book, Film, Series, Game, Album, Podcast or Other.")]
    public string Kind { get; init; } = MediaKinds.Film;

    [Required]
    [StringLength(200)]
    public string Title { get; init; } = string.Empty;

    [StringLength(200)]
    public string? Creator { get; init; }

    [StringLength(200)]
    public string? WhereToFind { get; init; }

    [Required]
    [AllowedValues(MediaStatuses.Want, MediaStatuses.InProgress, MediaStatuses.Finished, MediaStatuses.Dropped,
        ErrorMessage = "Status must be Want, InProgress, Finished or Dropped.")]
    public string Status { get; init; } = MediaStatuses.Want;

    public bool UpNext { get; init; }

    [Range(1, 100000, ErrorMessage = "Pages are 1 to 100,000.")]
    public int? TotalPages { get; init; }

    [Range(0, 100000, ErrorMessage = "The current page is 0 to 100,000.")]
    public int CurrentPage { get; init; }

    [Range(1, 1000, ErrorMessage = "Seasons are 1 to 1,000.")]
    public short? Season { get; init; }

    [Range(0, 10000, ErrorMessage = "Episodes are 0 to 10,000.")]
    public short? Episode { get; init; }

    public DateOnly? StartedOn { get; init; }
    public DateOnly? FinishedOn { get; init; }

    [Range(1, 5, ErrorMessage = "Ratings are 1 to 5.")]
    public byte? Rating { get; init; }

    [StringLength(2000)]
    public string? Review { get; init; }

    public int? SkillId { get; init; }
    public int? LifeAreaId { get; init; }
    public List<int> TagIds { get; init; } = [];

    /// <summary>The client's today: starting or finishing fills today when no day is given.</summary>
    public DateOnly Today { get; init; }
}

/// <summary>
/// "I'm on page 212" (a book) or "season 2, episode 4" (a series / podcast): starts something not started, a book's
/// last page finishes it.
/// </summary>
public class MediaProgressRequest
{
    [Range(0, 100000, ErrorMessage = "The current page is 0 to 100,000.")]
    public int? CurrentPage { get; init; }

    [Range(1, 1000, ErrorMessage = "Seasons are 1 to 1,000.")]
    public short? Season { get; init; }

    [Range(0, 10000, ErrorMessage = "Episodes are 0 to 10,000.")]
    public short? Episode { get; init; }

    public DateOnly Today { get; init; }
}

public class MediaNoteRequest
{
    [Required]
    [AllowedValues(MediaNoteKinds.Note, MediaNoteKinds.Highlight, ErrorMessage = "A note is a Note or a Highlight.")]
    public string Kind { get; init; } = MediaNoteKinds.Note;

    [Required]
    [StringLength(4000)]
    public string Text { get; init; } = string.Empty;

    [Range(1, 100000, ErrorMessage = "Pages are 1 to 100,000.")]
    public int? Page { get; init; }
}

public class MediaLogRequest
{
    public DateOnly LoggedOn { get; init; }

    [Range(1, 1440, ErrorMessage = "Minutes are 1 to 1,440.")]
    public int? Minutes { get; init; }

    [StringLength(500)]
    public string? Note { get; init; }

    public DateOnly Today { get; init; }
}

// ---- Hobbies ----

public class HobbyDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Description { get; init; }
    public string Status { get; init; } = HobbyStatuses.Active;
    public int? HabitId { get; init; }
    public string? HabitTitle { get; init; }
    public int? LifeAreaId { get; init; }
    public string? LifeAreaName { get; init; }
    public int SessionCount { get; init; }
    public int TotalMinutes { get; init; }
    public DateOnly? LastPracticedOn { get; init; }
}

public class HobbyDetailDto : HobbyDto
{
    /// <summary>Practice sessions, newest first.</summary>
    public List<HobbySessionDto> Sessions { get; init; } = [];
}

public class HobbySessionDto
{
    public int Id { get; init; }
    public int HobbyId { get; init; }
    public DateOnly PracticedOn { get; init; }
    public int Minutes { get; init; }
    public DateTime? StartedAt { get; init; }
    public string? Note { get; init; }
}

public class HobbyRequest
{
    [Required]
    [StringLength(100)]
    public string Name { get; init; } = string.Empty;

    [StringLength(1000)]
    public string? Description { get; init; }

    [Required]
    [AllowedValues(HobbyStatuses.Active, HobbyStatuses.Archived, ErrorMessage = "Status must be Active or Archived.")]
    public string Status { get; init; } = HobbyStatuses.Active;

    public int? HabitId { get; init; }
    public int? LifeAreaId { get; init; }
}

public class HobbySessionRequest
{
    public DateOnly PracticedOn { get; init; }

    [Range(1, 1440, ErrorMessage = "Minutes are 1 to 1,440.")]
    public int Minutes { get; init; }

    /// <summary>Set when the practice timer logged it; null when typed in.</summary>
    public DateTime? StartedAt { get; init; }

    [StringLength(1000)]
    public string? Note { get; init; }

    public DateOnly Today { get; init; }
}
