using AutoMapper;
using AutoMapper.QueryableExtensions;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.Services;
using LifeOS.Core.Story.DTOs;
using LifeOS.Core.Story.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Story.Services;

/// <summary>
/// Chapters follow one another (ChapterRules): every save is checked against the user's other chapters, and starting a
/// new current chapter closes the open one the day before, in the same transaction.
/// </summary>
public class ChaptersService(AppDbContext db, IMapper mapper) : IChaptersService
{
    private const string NotFound = StoryErrors.ChapterNotFound;
    private const string Clash = "Another chapter already starts that day, or one is already current.";

    public Task<List<ChapterDto>> ListAsync() =>
        db.Chapters
            .OrderBy(c => c.StartDate)
            .ProjectTo<ChapterDto>(mapper.ConfigurationProvider)
            .ToListAsync();

    public async Task<OperationResult<ChapterDto>> GetAsync(int id)
    {
        var chapter = await db.Chapters.Where(c => c.Id == id).ProjectTo<ChapterDto>(mapper.ConfigurationProvider).FirstOrDefaultAsync();
        return chapter is null ? OperationResult<ChapterDto>.Fail(NotFound) : OperationResult<ChapterDto>.Ok(chapter);
    }

    public Task<OperationResult<ChapterSaveResultDto>> CreateAsync(ChapterRequest request) =>
        SaveAsync(null, request);

    public async Task<OperationResult<ChapterSaveResultDto>> UpdateAsync(int id, ChapterRequest request)
    {
        var chapter = await db.Chapters.FindAsync(id);
        return chapter is null ? OperationResult<ChapterSaveResultDto>.Fail(NotFound) : await SaveAsync(chapter, request);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var chapter = await db.Chapters.FindAsync(id);
        if (chapter is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        // Only the chapter goes; its beats belong to goals/habits/journal and simply fall into a gap in the story.
        chapter.IsDeleted = true;
        chapter.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<OperationResult<ChapterSaveResultDto>> SaveAsync(Chapter? existing, ChapterRequest request)
    {
        var title = request.Title.Trim();
        if (title.Length == 0)
        {
            return OperationResult<ChapterSaveResultDto>.Fail("Give the chapter a title.");
        }

        var start = request.StartDate!.Value;
        var others = await db.Chapters
            .Where(c => existing == null || c.Id != existing.Id)
            .Select(c => new ChapterSpan(c.Id, c.Title, c.StartDate, c.EndDate))
            .ToListAsync();

        var check = ChapterRules.Check(others, new ChapterSpan(existing?.Id ?? 0, title, start, request.EndDate));
        if (!check.Ok)
        {
            return OperationResult<ChapterSaveResultDto>.Fail(check.Error!);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();

        Chapter? closed = null;
        if (check.CloseChapterId is { } closeId)
        {
            // Close first and save, so the "one open chapter" index never sees two at once.
            closed = await db.Chapters.FindAsync(closeId);
            closed!.EndDate = check.CloseOn;
            closed.UpdatedAt = now;
            await db.SaveChangesAsync();
        }

        var chapter = existing ?? new Chapter { UserId = db.CurrentUserId!.Value };
        chapter.Title = title;
        chapter.Summary = string.IsNullOrWhiteSpace(request.Summary) ? null : request.Summary.Trim();
        chapter.StartDate = start;
        chapter.EndDate = request.EndDate;
        if (existing is null)
        {
            db.Chapters.Add(chapter);
        }
        else
        {
            chapter.UpdatedAt = now;
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            // A concurrent save got there first (same start day, or a second open chapter).
            return OperationResult<ChapterSaveResultDto>.Fail(Clash);
        }

        await transaction.CommitAsync();
        return OperationResult<ChapterSaveResultDto>.Ok(new ChapterSaveResultDto
        {
            Chapter = mapper.Map<ChapterDto>(chapter),
            ClosedChapter = closed is null ? null : mapper.Map<ChapterDto>(closed),
        });
    }
}
