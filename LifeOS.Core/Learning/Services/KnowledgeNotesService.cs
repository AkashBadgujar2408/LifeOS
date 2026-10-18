using LifeOS.Core.Learning.DTOs;
using LifeOS.Core.Learning.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Learning.Services;

/// <summary>
/// Knowledge notes and the revision planner. A note in review has a NextReviewOn; reviewing it moves it along the
/// 1/3/7/14/30-day intervals (RevisionPlanner). Tags, search and links come with the knowledge base (Session 50).
/// </summary>
public class KnowledgeNotesService(AppDbContext db) : IKnowledgeNotesService
{
    private const string NotFound = "Note not found.";

    public async Task<List<KnowledgeNoteDto>> GetAllAsync() =>
        await db.KnowledgeNotes
            .OrderByDescending(n => n.UpdatedAt ?? n.CreatedAt).ThenByDescending(n => n.Id)
            .Select(ToDto)
            .ToListAsync();

    public async Task<List<KnowledgeNoteDto>> GetDueAsync(DateOnly today) =>
        await db.KnowledgeNotes
            .Where(n => n.NextReviewOn != null && n.NextReviewOn <= today)
            // Longest overdue first: it's the one closest to being forgotten.
            .OrderBy(n => n.NextReviewOn).ThenBy(n => n.Id)
            .Select(ToDto)
            .ToListAsync();

    public async Task<OperationResult<KnowledgeNoteDto>> GetAsync(int id)
    {
        var note = await db.KnowledgeNotes.Where(n => n.Id == id).Select(ToDto).FirstOrDefaultAsync();
        return note is null ? OperationResult<KnowledgeNoteDto>.Fail(NotFound) : OperationResult<KnowledgeNoteDto>.Ok(note);
    }

    public async Task<OperationResult<KnowledgeNoteDto>> CreateAsync(KnowledgeNoteRequest request)
    {
        var note = new KnowledgeNote { UserId = db.CurrentUserId!.Value };
        var error = await ApplyAsync(note, request);
        if (error is not null)
        {
            return OperationResult<KnowledgeNoteDto>.Fail(error);
        }

        db.KnowledgeNotes.Add(note);
        await db.SaveChangesAsync();
        return await GetAsync(note.Id);
    }

    public async Task<OperationResult<KnowledgeNoteDto>> UpdateAsync(int id, KnowledgeNoteRequest request)
    {
        var note = await db.KnowledgeNotes.FindAsync(id);
        if (note is null)
        {
            return OperationResult<KnowledgeNoteDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(note, request);
        if (error is not null)
        {
            return OperationResult<KnowledgeNoteDto>.Fail(error);
        }

        note.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<KnowledgeNoteDto>> ReviewAsync(int id, ReviewNoteRequest request)
    {
        var note = await db.KnowledgeNotes.FindAsync(id);
        if (note is null)
        {
            return OperationResult<KnowledgeNoteDto>.Fail(NotFound);
        }

        if (request.Today == default)
        {
            return OperationResult<KnowledgeNoteDto>.Fail("Today's date is required.");
        }

        if (note.NextReviewOn is null)
        {
            return OperationResult<KnowledgeNoteDto>.Fail("This note isn't in your revision planner.");
        }

        if (note.LastReviewedOn is { } last && last >= request.Today)
        {
            return OperationResult<KnowledgeNoteDto>.Fail("Already reviewed today. It's back on its next day.");
        }

        var state = RevisionPlanner.Review(note.ReviewStage, request.Remembered, request.Today);
        note.ReviewStage = state.Stage;
        note.NextReviewOn = state.NextReviewOn;
        note.LastReviewedOn = state.LastReviewedOn;
        note.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var note = await db.KnowledgeNotes.FindAsync(id);
        if (note is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await db.KnowledgeNoteTags.Where(t => t.KnowledgeNoteId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.IsDeleted, true).SetProperty(t => t.DeletedAt, now));
        note.IsDeleted = true;
        note.DeletedAt = now;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<string?> ApplyAsync(KnowledgeNote note, KnowledgeNoteRequest request)
    {
        var title = request.Title.Trim();
        if (title.Length == 0)
        {
            return "Give the note a title.";
        }

        if (request.Today == default)
        {
            return "Today's date is required.";
        }

        if (request.SkillId is { } skillId && !await db.Skills.AnyAsync(s => s.Id == skillId))
        {
            return "Skill not found.";
        }

        note.Title = title;
        note.Content = string.IsNullOrWhiteSpace(request.Content) ? null : request.Content.Trim();
        note.SkillId = request.SkillId;

        // Into review: start the intervals (unless it's already being reviewed). Out: drop the schedule, keep the
        // last review day as history.
        if (request.Review && note.NextReviewOn is null)
        {
            var start = RevisionPlanner.Start(request.Today);
            note.ReviewStage = start.Stage;
            note.NextReviewOn = start.NextReviewOn;
            // CK_KnowledgeNotes_Review: the next review must come after the last one.
            if (note.LastReviewedOn is { } last && last >= note.NextReviewOn)
            {
                note.LastReviewedOn = null;
            }
        }
        else if (!request.Review)
        {
            note.NextReviewOn = null;
            note.ReviewStage = 0;
        }

        return null;
    }

    private static readonly System.Linq.Expressions.Expression<Func<KnowledgeNote, KnowledgeNoteDto>> ToDto = n => new KnowledgeNoteDto
    {
        Id = n.Id,
        Title = n.Title,
        Content = n.Content,
        SkillId = n.SkillId,
        SkillName = n.Skill != null ? n.Skill.Name : null,
        ReviewStage = n.ReviewStage,
        NextReviewOn = n.NextReviewOn,
        LastReviewedOn = n.LastReviewedOn,
        UpdatedAt = n.UpdatedAt ?? n.CreatedAt,
    };
}
