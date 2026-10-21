using System.Linq.Expressions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Leisure.DTOs;
using LifeOS.Core.Leisure.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Leisure.Services;

/// <summary>
/// The media backlog (Session 78a): books, films, series, games, albums, podcasts — their progress (kept consistent
/// by <see cref="LeisureRules"/>), notes and highlights, and each logged watch / play / listen.
/// </summary>
public class MediaItemsService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService,
    IGoalMeasureService goalMeasureService) : IMediaItemsService
{
    private const string NotFound = "Item not found.";
    private const string NoteNotFound = "Note not found.";
    private const string LogNotFound = "Log not found.";

    public async Task<List<MediaItemDto>> GetAllAsync(string? kind, string? status)
    {
        var query = db.MediaItems.AsQueryable();
        if (!string.IsNullOrWhiteSpace(kind))
        {
            query = query.Where(m => m.Kind == kind);
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            query = query.Where(m => m.Status == status);
        }

        var items = await query
            .OrderBy(m => m.Status == MediaStatuses.InProgress ? 0
                : m.Status == MediaStatuses.Want && m.UpNext ? 1
                : m.Status == MediaStatuses.Want ? 2
                : m.Status == MediaStatuses.Finished ? 3 : 4)
            .ThenByDescending(m => m.FinishedOn)
            .ThenBy(m => m.Title)
            .Select(ToDto)
            .AsSplitQuery()
            .ToListAsync();
        foreach (var item in items)
        {
            item.ProgressPercent = LeisureRules.Percent(item.Kind, item.Status, item.TotalPages, item.CurrentPage);
        }

        return items;
    }

    public async Task<OperationResult<MediaItemDetailDto>> GetAsync(int id)
    {
        var item = await db.MediaItems.Where(m => m.Id == id).Select(ToDetailDto).AsSplitQuery().FirstOrDefaultAsync();
        if (item is null)
        {
            return OperationResult<MediaItemDetailDto>.Fail(NotFound);
        }

        item.ProgressPercent = LeisureRules.Percent(item.Kind, item.Status, item.TotalPages, item.CurrentPage);
        return OperationResult<MediaItemDetailDto>.Ok(item);
    }

    public async Task<OperationResult<MediaItemDetailDto>> CreateAsync(MediaItemRequest request)
    {
        var userId = db.CurrentUserId!.Value;
        var item = new MediaItem { UserId = userId };
        var error = await ApplyAsync(item, request);
        if (error is not null)
        {
            return OperationResult<MediaItemDetailDto>.Fail(error);
        }

        foreach (var tagId in request.TagIds.Distinct())
        {
            item.MediaItemTags.Add(new MediaItemTag { UserId = userId, TagId = tagId });
        }

        db.MediaItems.Add(item);
        await db.SaveChangesAsync();
        return await GetAsync(item.Id);
    }

    public async Task<OperationResult<MediaItemDetailDto>> UpdateAsync(int id, MediaItemRequest request)
    {
        var item = await db.MediaItems.FindAsync(id);
        if (item is null)
        {
            return OperationResult<MediaItemDetailDto>.Fail(NotFound);
        }

        if (item.Kind == MediaKinds.Book && request.Kind != MediaKinds.Book
            && await db.MediaNotes.AnyAsync(n => n.MediaItemId == id && n.Page != null))
        {
            return OperationResult<MediaItemDetailDto>.Fail("Its notes are on pages, so it stays a book.");
        }

        var error = await ApplyAsync(item, request);
        if (error is not null)
        {
            return OperationResult<MediaItemDetailDto>.Fail(error);
        }

        item.UpdatedAt = DateTime.UtcNow;
        var wanted = request.TagIds.ToHashSet();
        var current = await db.MediaItemTags.Where(t => t.MediaItemId == id).ToListAsync();
        foreach (var tag in current.Where(t => !wanted.Contains(t.TagId)))
        {
            tag.IsDeleted = true;
            tag.DeletedAt = DateTime.UtcNow;
        }

        foreach (var tagId in wanted.Except(current.Select(t => t.TagId)))
        {
            db.MediaItemTags.Add(new MediaItemTag { UserId = item.UserId, MediaItemId = id, TagId = tagId });
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<MediaItemDetailDto>.Fail("This item was changed somewhere else at the same time. Reload and try again.");
        }

        return await GetAsync(id);
    }

    public async Task<OperationResult<MediaItemDetailDto>> SetProgressAsync(int id, MediaProgressRequest request)
    {
        var item = await db.MediaItems.FindAsync(id);
        if (item is null)
        {
            return OperationResult<MediaItemDetailDto>.Fail(NotFound);
        }

        if (request.Today == default)
        {
            return OperationResult<MediaItemDetailDto>.Fail("Today's date is required.");
        }

        var current = StateOf(item);
        var (state, error) = request.CurrentPage is { } page
            ? LeisureRules.AtPage(current, page, request.Today)
            : request.Episode is { } episode
                ? LeisureRules.AtEpisode(current, request.Season, episode, request.Today)
                : (null, "Say the page or the episode you're on.");
        if (error is not null)
        {
            return OperationResult<MediaItemDetailDto>.Fail(error);
        }

        Apply(item, state!);
        item.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var item = await db.MediaItems.FindAsync(id);
        if (item is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        // Goals counted from it keep what it counted (Carried over), read before anything it serves is released.
        await goalMeasureService.ReleaseEntityAsync(MediaItemLinkableProvider.Type, id);
        await db.MediaNotes.Where(n => n.MediaItemId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.IsDeleted, true).SetProperty(n => n.DeletedAt, now));
        await db.MediaItemTags.Where(t => t.MediaItemId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.IsDeleted, true).SetProperty(t => t.DeletedAt, now));
        await db.MediaLogs.Where(l => l.MediaItemId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(l => l.IsDeleted, true).SetProperty(l => l.DeletedAt, now));
        // A roadmap step that was this item stays as a plain step; study sessions about it keep their minutes.
        await db.RoadmapSteps.Where(s => s.MediaItemId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.MediaItemId, (int?)null).SetProperty(x => x.UpdatedAt, now));
        item.IsDeleted = true;
        item.DeletedAt = now;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(MediaItemLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(MediaItemLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task<OperationResult<MediaNoteDto>> AddNoteAsync(int itemId, MediaNoteRequest request)
    {
        var item = await db.MediaItems.FindAsync(itemId);
        if (item is null)
        {
            return OperationResult<MediaNoteDto>.Fail(NotFound);
        }

        var error = CheckNote(item, request);
        if (error is not null)
        {
            return OperationResult<MediaNoteDto>.Fail(error);
        }

        var note = new MediaNote { UserId = item.UserId, MediaItemId = itemId };
        ApplyNote(note, request);
        db.MediaNotes.Add(note);
        await db.SaveChangesAsync();
        return OperationResult<MediaNoteDto>.Ok(ToNoteDto(note));
    }

    public async Task<OperationResult<MediaNoteDto>> UpdateNoteAsync(int itemId, int noteId, MediaNoteRequest request)
    {
        var note = await db.MediaNotes.Include(n => n.MediaItem).FirstOrDefaultAsync(n => n.Id == noteId && n.MediaItemId == itemId);
        if (note is null)
        {
            return OperationResult<MediaNoteDto>.Fail(NoteNotFound);
        }

        var error = CheckNote(note.MediaItem, request);
        if (error is not null)
        {
            return OperationResult<MediaNoteDto>.Fail(error);
        }

        ApplyNote(note, request);
        note.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<MediaNoteDto>.Ok(ToNoteDto(note));
    }

    public async Task<OperationResult<bool>> DeleteNoteAsync(int itemId, int noteId)
    {
        var note = await db.MediaNotes.FirstOrDefaultAsync(n => n.Id == noteId && n.MediaItemId == itemId);
        if (note is null)
        {
            return OperationResult<bool>.Fail(NoteNotFound);
        }

        note.IsDeleted = true;
        note.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task<OperationResult<MediaLogDto>> AddLogAsync(int itemId, MediaLogRequest request)
    {
        var item = await db.MediaItems.FindAsync(itemId);
        if (item is null)
        {
            return OperationResult<MediaLogDto>.Fail(NotFound);
        }

        var error = LeisureRules.CheckLog(request.LoggedOn, request.Today);
        if (error is not null)
        {
            return OperationResult<MediaLogDto>.Fail(error);
        }

        var log = new MediaLog { UserId = item.UserId, MediaItemId = itemId };
        ApplyLog(log, request);
        db.MediaLogs.Add(log);
        await db.SaveChangesAsync();
        return OperationResult<MediaLogDto>.Ok(ToLogDto(log));
    }

    public async Task<OperationResult<MediaLogDto>> UpdateLogAsync(int itemId, int logId, MediaLogRequest request)
    {
        var log = await db.MediaLogs.FirstOrDefaultAsync(l => l.Id == logId && l.MediaItemId == itemId);
        if (log is null)
        {
            return OperationResult<MediaLogDto>.Fail(LogNotFound);
        }

        var error = LeisureRules.CheckLog(request.LoggedOn, request.Today);
        if (error is not null)
        {
            return OperationResult<MediaLogDto>.Fail(error);
        }

        ApplyLog(log, request);
        log.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<MediaLogDto>.Ok(ToLogDto(log));
    }

    public async Task<OperationResult<bool>> DeleteLogAsync(int itemId, int logId)
    {
        var log = await db.MediaLogs.FirstOrDefaultAsync(l => l.Id == logId && l.MediaItemId == itemId);
        if (log is null)
        {
            return OperationResult<bool>.Fail(LogNotFound);
        }

        log.IsDeleted = true;
        log.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    private static string? CheckNote(MediaItem item, MediaNoteRequest request)
    {
        if (request.Text.Trim().Length == 0)
        {
            return "Write the note or paste the highlight.";
        }

        if (request.Page is not null && item.Kind != MediaKinds.Book)
        {
            return "Only a book's notes have pages.";
        }

        return request.Page is { } page && item.TotalPages is { } total && page > total
            ? $"This book has {total} pages."
            : null;
    }

    private static void ApplyNote(MediaNote note, MediaNoteRequest request)
    {
        note.Kind = request.Kind;
        note.Text = request.Text.Trim();
        note.Page = request.Page;
    }

    private static void ApplyLog(MediaLog log, MediaLogRequest request)
    {
        log.LoggedOn = request.LoggedOn;
        log.Minutes = request.Minutes;
        log.Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
    }

    private async Task<string?> ApplyAsync(MediaItem item, MediaItemRequest request)
    {
        var title = request.Title.Trim();
        if (title.Length == 0)
        {
            return "Give it a title.";
        }

        if (request.Today == default)
        {
            return "Today's date is required.";
        }

        var (state, error) = LeisureRules.Check(new MediaState(request.Kind, request.Status, request.UpNext,
            request.TotalPages, request.CurrentPage, request.Season, request.Episode, request.StartedOn,
            request.FinishedOn, request.Rating, request.Review), request.Today);
        error ??= await CheckReferencesAsync(request);
        if (error is not null)
        {
            return error;
        }

        item.Kind = request.Kind;
        item.Title = title;
        item.Creator = string.IsNullOrWhiteSpace(request.Creator) ? null : request.Creator.Trim();
        item.WhereToFind = string.IsNullOrWhiteSpace(request.WhereToFind) ? null : request.WhereToFind.Trim();
        item.SkillId = request.SkillId;
        item.LifeAreaId = request.LifeAreaId;
        Apply(item, state!);
        return null;
    }

    // Another user's skill, life area or tag counts as missing (the filters apply).
    private async Task<string?> CheckReferencesAsync(MediaItemRequest request)
    {
        if (request.LifeAreaId is { } areaId && !await db.LifeAreas.AnyAsync(a => a.Id == areaId))
        {
            return "Life area not found.";
        }

        if (request.SkillId is { } skillId && !await db.Skills.AnyAsync(s => s.Id == skillId))
        {
            return "Skill not found.";
        }

        var tagIds = request.TagIds.Distinct().ToList();
        return tagIds.Count > 0 && await db.Tags.CountAsync(t => tagIds.Contains(t.Id)) != tagIds.Count
            ? "Tag not found."
            : null;
    }

    private static MediaState StateOf(MediaItem m) =>
        new(m.Kind, m.Status, m.UpNext, m.TotalPages, m.CurrentPage, m.Season, m.Episode, m.StartedOn, m.FinishedOn,
            m.Rating, m.Review);

    private static void Apply(MediaItem item, MediaState state)
    {
        item.Status = state.Status;
        item.UpNext = state.UpNext;
        item.TotalPages = state.TotalPages;
        item.CurrentPage = state.CurrentPage;
        item.Season = state.Season;
        item.Episode = state.Episode;
        item.StartedOn = state.StartedOn;
        item.FinishedOn = state.FinishedOn;
        item.Rating = state.Rating;
        item.Review = state.Review;
    }

    private static MediaNoteDto ToNoteDto(MediaNote n) => new()
    {
        Id = n.Id,
        Kind = n.Kind,
        Text = n.Text,
        Page = n.Page,
        CreatedAt = n.CreatedAt,
    };

    private static MediaLogDto ToLogDto(MediaLog l) => new() { Id = l.Id, LoggedOn = l.LoggedOn, Minutes = l.Minutes, Note = l.Note };

    // The soft-delete filter doesn't reach into a projection's collections, so they filter IsDeleted themselves.
    private static readonly Expression<Func<MediaItem, MediaItemDto>> ToDto = m => new MediaItemDto
    {
        Id = m.Id,
        Kind = m.Kind,
        Title = m.Title,
        Creator = m.Creator,
        WhereToFind = m.WhereToFind,
        Status = m.Status,
        UpNext = m.UpNext,
        TotalPages = m.TotalPages,
        CurrentPage = m.CurrentPage,
        Season = m.Season,
        Episode = m.Episode,
        StartedOn = m.StartedOn,
        FinishedOn = m.FinishedOn,
        Rating = m.Rating,
        Review = m.Review,
        SkillId = m.Skill != null && !m.Skill.IsDeleted ? m.SkillId : null,
        SkillName = m.Skill != null && !m.Skill.IsDeleted ? m.Skill.Name : null,
        LifeAreaId = m.LifeAreaId,
        LifeAreaName = m.LifeArea != null ? m.LifeArea.Name : null,
        Tags = m.MediaItemTags.Where(t => !t.IsDeleted && !t.Tag.IsDeleted).OrderBy(t => t.Tag.Name)
            .Select(t => new TagDto { Id = t.TagId, Name = t.Tag.Name }).ToList(),
        NoteCount = m.MediaNotes.Count(n => !n.IsDeleted),
        LogCount = m.MediaLogs.Count(l => !l.IsDeleted),
        MinutesLogged = m.MediaLogs.Where(l => !l.IsDeleted).Sum(l => l.Minutes ?? 0),
    };

    private static readonly Expression<Func<MediaItem, MediaItemDetailDto>> ToDetailDto = m => new MediaItemDetailDto
    {
        Id = m.Id,
        Kind = m.Kind,
        Title = m.Title,
        Creator = m.Creator,
        WhereToFind = m.WhereToFind,
        Status = m.Status,
        UpNext = m.UpNext,
        TotalPages = m.TotalPages,
        CurrentPage = m.CurrentPage,
        Season = m.Season,
        Episode = m.Episode,
        StartedOn = m.StartedOn,
        FinishedOn = m.FinishedOn,
        Rating = m.Rating,
        Review = m.Review,
        SkillId = m.Skill != null && !m.Skill.IsDeleted ? m.SkillId : null,
        SkillName = m.Skill != null && !m.Skill.IsDeleted ? m.Skill.Name : null,
        LifeAreaId = m.LifeAreaId,
        LifeAreaName = m.LifeArea != null ? m.LifeArea.Name : null,
        Tags = m.MediaItemTags.Where(t => !t.IsDeleted && !t.Tag.IsDeleted).OrderBy(t => t.Tag.Name)
            .Select(t => new TagDto { Id = t.TagId, Name = t.Tag.Name }).ToList(),
        NoteCount = m.MediaNotes.Count(n => !n.IsDeleted),
        LogCount = m.MediaLogs.Count(l => !l.IsDeleted),
        MinutesLogged = m.MediaLogs.Where(l => !l.IsDeleted).Sum(l => l.Minutes ?? 0),
        Notes = m.MediaNotes.Where(n => !n.IsDeleted)
            .OrderBy(n => n.Page == null).ThenBy(n => n.Page).ThenBy(n => n.Id)
            .Select(n => new MediaNoteDto { Id = n.Id, Kind = n.Kind, Text = n.Text, Page = n.Page, CreatedAt = n.CreatedAt })
            .ToList(),
        Logs = m.MediaLogs.Where(l => !l.IsDeleted)
            .OrderByDescending(l => l.LoggedOn).ThenByDescending(l => l.Id)
            .Select(l => new MediaLogDto { Id = l.Id, LoggedOn = l.LoggedOn, Minutes = l.Minutes, Note = l.Note })
            .ToList(),
    };
}
