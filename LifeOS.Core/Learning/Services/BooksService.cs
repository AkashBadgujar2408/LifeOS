using System.Linq.Expressions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Goals.ServiceContracts;
using LifeOS.Core.Learning.DTOs;
using LifeOS.Core.Learning.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Learning.Services;

/// <summary>
/// The reading list: books with their progress (LearningRules keeps status, pages and dates consistent) and the
/// notes and highlights each one left behind.
/// </summary>
public class BooksService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService,
    IGoalMeasureService goalMeasureService) : IBooksService
{
    private const string NotFound = "Book not found.";
    private const string NoteNotFound = "Note not found.";

    public async Task<List<BookDto>> GetAllAsync(string? status)
    {
        var query = db.Books.AsQueryable();
        if (!string.IsNullOrWhiteSpace(status))
        {
            query = query.Where(b => b.Status == status);
        }

        var books = await query
            .OrderBy(b => b.Status == BookStatuses.Reading ? 0 : b.Status == BookStatuses.WantToRead ? 1 : b.Status == BookStatuses.Finished ? 2 : 3)
            .ThenByDescending(b => b.FinishedOn)
            .ThenBy(b => b.Title)
            .Select(ToDto)
            .AsSplitQuery()
            .ToListAsync();
        foreach (var book in books)
        {
            book.ProgressPercent = LearningRules.BookPercent(book.Status, book.TotalPages, book.CurrentPage);
        }

        return books;
    }

    public async Task<OperationResult<BookDetailDto>> GetAsync(int id)
    {
        var book = await db.Books.Where(b => b.Id == id).Select(ToDetailDto).AsSplitQuery().FirstOrDefaultAsync();
        if (book is null)
        {
            return OperationResult<BookDetailDto>.Fail(NotFound);
        }

        book.ProgressPercent = LearningRules.BookPercent(book.Status, book.TotalPages, book.CurrentPage);
        return OperationResult<BookDetailDto>.Ok(book);
    }

    public async Task<OperationResult<BookDetailDto>> CreateAsync(BookRequest request)
    {
        var userId = db.CurrentUserId!.Value;
        var book = new Book { UserId = userId };
        var error = await ApplyAsync(book, request);
        if (error is not null)
        {
            return OperationResult<BookDetailDto>.Fail(error);
        }

        foreach (var tagId in request.TagIds.Distinct())
        {
            book.BookTags.Add(new BookTag { UserId = userId, TagId = tagId });
        }

        db.Books.Add(book);
        await db.SaveChangesAsync();
        return await GetAsync(book.Id);
    }

    public async Task<OperationResult<BookDetailDto>> UpdateAsync(int id, BookRequest request)
    {
        var book = await db.Books.FindAsync(id);
        if (book is null)
        {
            return OperationResult<BookDetailDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(book, request);
        if (error is not null)
        {
            return OperationResult<BookDetailDto>.Fail(error);
        }

        book.UpdatedAt = DateTime.UtcNow;
        var wanted = request.TagIds.ToHashSet();
        var current = await db.BookTags.Where(bt => bt.BookId == id).ToListAsync();
        foreach (var tag in current.Where(bt => !wanted.Contains(bt.TagId)))
        {
            tag.IsDeleted = true;
            tag.DeletedAt = DateTime.UtcNow;
        }

        foreach (var tagId in wanted.Except(current.Select(bt => bt.TagId)))
        {
            db.BookTags.Add(new BookTag { UserId = book.UserId, BookId = id, TagId = tagId });
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (Shared.Services.DbUpdateExceptionExtensions.IsUniqueConstraintViolation(ex))
        {
            return OperationResult<BookDetailDto>.Fail("This book was changed somewhere else at the same time. Reload and try again.");
        }

        return await GetAsync(id);
    }

    public async Task<OperationResult<BookDetailDto>> SetProgressAsync(int id, BookProgressRequest request)
    {
        var book = await db.Books.FindAsync(id);
        if (book is null)
        {
            return OperationResult<BookDetailDto>.Fail(NotFound);
        }

        if (request.Today == default)
        {
            return OperationResult<BookDetailDto>.Fail("Today's date is required.");
        }

        var current = new BookState(book.Status, book.TotalPages, book.CurrentPage, book.StartedOn, book.FinishedOn, book.Rating);
        var (state, error) = LearningRules.AtPage(current, request.CurrentPage, request.Today);
        if (error is not null)
        {
            return OperationResult<BookDetailDto>.Fail(error);
        }

        Apply(book, state!);
        book.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var book = await db.Books.FindAsync(id);
        if (book is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        // Goals counted from it keep what it counted (Carried over), read before anything it serves is released.
        await goalMeasureService.ReleaseEntityAsync(BookLinkableProvider.Type, id);
        await db.BookNotes.Where(n => n.BookId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.IsDeleted, true).SetProperty(n => n.DeletedAt, now));
        await db.BookTags.Where(t => t.BookId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.IsDeleted, true).SetProperty(t => t.DeletedAt, now));
        await db.RoadmapSteps.Where(s => s.BookId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.BookId, (int?)null).SetProperty(x => x.UpdatedAt, now));
        book.IsDeleted = true;
        book.DeletedAt = now;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(BookLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(BookLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task<OperationResult<BookNoteDto>> AddNoteAsync(int bookId, BookNoteRequest request)
    {
        var book = await db.Books.FindAsync(bookId);
        if (book is null)
        {
            return OperationResult<BookNoteDto>.Fail(NotFound);
        }

        var error = CheckNote(book, request);
        if (error is not null)
        {
            return OperationResult<BookNoteDto>.Fail(error);
        }

        var note = new BookNote { UserId = book.UserId, BookId = bookId };
        ApplyNote(note, request);
        db.BookNotes.Add(note);
        await db.SaveChangesAsync();
        return OperationResult<BookNoteDto>.Ok(ToNoteDto(note));
    }

    public async Task<OperationResult<BookNoteDto>> UpdateNoteAsync(int bookId, int noteId, BookNoteRequest request)
    {
        var note = await db.BookNotes.Include(n => n.Book).FirstOrDefaultAsync(n => n.Id == noteId && n.BookId == bookId);
        if (note is null)
        {
            return OperationResult<BookNoteDto>.Fail(NoteNotFound);
        }

        var error = CheckNote(note.Book, request);
        if (error is not null)
        {
            return OperationResult<BookNoteDto>.Fail(error);
        }

        ApplyNote(note, request);
        note.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<BookNoteDto>.Ok(ToNoteDto(note));
    }

    public async Task<OperationResult<bool>> DeleteNoteAsync(int bookId, int noteId)
    {
        var note = await db.BookNotes.FirstOrDefaultAsync(n => n.Id == noteId && n.BookId == bookId);
        if (note is null)
        {
            return OperationResult<bool>.Fail(NoteNotFound);
        }

        note.IsDeleted = true;
        note.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    private static string? CheckNote(Book book, BookNoteRequest request)
    {
        if (request.Text.Trim().Length == 0)
        {
            return "Write the note or paste the highlight.";
        }

        return request.Page is { } page && book.TotalPages is { } total && page > total
            ? $"This book has {total} pages."
            : null;
    }

    private static void ApplyNote(BookNote note, BookNoteRequest request)
    {
        note.Kind = request.Kind;
        note.Text = request.Text.Trim();
        note.Page = request.Page;
    }

    private async Task<string?> ApplyAsync(Book book, BookRequest request)
    {
        var title = request.Title.Trim();
        if (title.Length == 0)
        {
            return "Give the book a title.";
        }

        if (request.Today == default)
        {
            return "Today's date is required.";
        }

        var (state, error) = LearningRules.Book(request.Status, request.TotalPages, request.CurrentPage,
            request.StartedOn, request.FinishedOn, request.Rating, request.Today);
        error ??= await LearningLookups.CheckAsync(db, request.LifeAreaId, request.TagIds, request.SkillId);
        if (error is not null)
        {
            return error;
        }

        book.Title = title;
        book.Author = string.IsNullOrWhiteSpace(request.Author) ? null : request.Author.Trim();
        book.SkillId = request.SkillId;
        book.LifeAreaId = request.LifeAreaId;
        Apply(book, state!);
        return null;
    }

    private static void Apply(Book book, BookState state)
    {
        book.Status = state.Status;
        book.TotalPages = state.TotalPages;
        book.CurrentPage = state.CurrentPage;
        book.StartedOn = state.StartedOn;
        book.FinishedOn = state.FinishedOn;
        book.Rating = state.Rating;
    }

    private static BookNoteDto ToNoteDto(BookNote n) => new()
    {
        Id = n.Id,
        Kind = n.Kind,
        Text = n.Text,
        Page = n.Page,
        CreatedAt = n.CreatedAt,
    };

    private static readonly Expression<Func<Book, BookDto>> ToDto = b => new BookDto
    {
        Id = b.Id,
        Title = b.Title,
        Author = b.Author,
        Status = b.Status,
        TotalPages = b.TotalPages,
        CurrentPage = b.CurrentPage,
        StartedOn = b.StartedOn,
        FinishedOn = b.FinishedOn,
        Rating = b.Rating,
        SkillId = b.SkillId,
        SkillName = b.Skill != null ? b.Skill.Name : null,
        LifeAreaId = b.LifeAreaId,
        LifeAreaName = b.LifeArea != null ? b.LifeArea.Name : null,
        Tags = b.BookTags.OrderBy(bt => bt.Tag.Name).Select(bt => new TagDto { Id = bt.TagId, Name = bt.Tag.Name }).ToList(),
        NoteCount = b.BookNotes.Count,
    };

    private static readonly Expression<Func<Book, BookDetailDto>> ToDetailDto = b => new BookDetailDto
    {
        Id = b.Id,
        Title = b.Title,
        Author = b.Author,
        Status = b.Status,
        TotalPages = b.TotalPages,
        CurrentPage = b.CurrentPage,
        StartedOn = b.StartedOn,
        FinishedOn = b.FinishedOn,
        Rating = b.Rating,
        SkillId = b.SkillId,
        SkillName = b.Skill != null ? b.Skill.Name : null,
        LifeAreaId = b.LifeAreaId,
        LifeAreaName = b.LifeArea != null ? b.LifeArea.Name : null,
        Tags = b.BookTags.OrderBy(bt => bt.Tag.Name).Select(bt => new TagDto { Id = bt.TagId, Name = bt.Tag.Name }).ToList(),
        NoteCount = b.BookNotes.Count,
        Notes = b.BookNotes
            .OrderBy(n => n.Page == null).ThenBy(n => n.Page).ThenBy(n => n.Id)
            .Select(n => new BookNoteDto { Id = n.Id, Kind = n.Kind, Text = n.Text, Page = n.Page, CreatedAt = n.CreatedAt })
            .ToList(),
    };
}
