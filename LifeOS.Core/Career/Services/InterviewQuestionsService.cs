using System.Linq.Expressions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Career.DTOs;
using LifeOS.Core.Career.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Career.Services;

/// <summary>
/// The interview question bank: a question, your answer, what to do better next time; general or asked in one
/// application, topics as tags (replaced whole on save), and the last day you practised it.
/// </summary>
public class InterviewQuestionsService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService)
    : IInterviewQuestionsService
{
    private const string NotFound = "Question not found.";

    public async Task<List<InterviewQuestionDto>> GetAllAsync(int? tagId, int? applicationId)
    {
        var query = db.InterviewQuestions.AsQueryable();
        if (tagId is { } tag)
        {
            query = query.Where(q => q.InterviewQuestionTags.Any(t => t.TagId == tag));
        }

        if (applicationId is { } application)
        {
            query = query.Where(q => q.JobApplicationId == application);
        }

        return await query.OrderByDescending(q => q.UpdatedAt ?? q.CreatedAt).ThenByDescending(q => q.Id).Select(ToDto).ToListAsync();
    }

    public async Task<OperationResult<InterviewQuestionDto>> GetAsync(int id)
    {
        var question = await db.InterviewQuestions.Where(q => q.Id == id).Select(ToDto).FirstOrDefaultAsync();
        return question is null ? OperationResult<InterviewQuestionDto>.Fail(NotFound) : OperationResult<InterviewQuestionDto>.Ok(question);
    }

    public async Task<OperationResult<InterviewQuestionDto>> CreateAsync(InterviewQuestionRequest request)
    {
        var userId = db.CurrentUserId!.Value;
        var question = new InterviewQuestion { UserId = userId };
        var error = await ApplyAsync(question, request);
        if (error is not null)
        {
            return OperationResult<InterviewQuestionDto>.Fail(error);
        }

        foreach (var tagId in request.TagIds.Distinct())
        {
            question.InterviewQuestionTags.Add(new InterviewQuestionTag { UserId = userId, TagId = tagId });
        }

        db.InterviewQuestions.Add(question);
        await db.SaveChangesAsync();
        return await GetAsync(question.Id);
    }

    public async Task<OperationResult<InterviewQuestionDto>> UpdateAsync(int id, InterviewQuestionRequest request)
    {
        var question = await db.InterviewQuestions.FindAsync(id);
        if (question is null)
        {
            return OperationResult<InterviewQuestionDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(question, request);
        if (error is not null)
        {
            return OperationResult<InterviewQuestionDto>.Fail(error);
        }

        var now = DateTime.UtcNow;
        question.UpdatedAt = now;
        var wanted = request.TagIds.ToHashSet();
        var current = await db.InterviewQuestionTags.Where(t => t.InterviewQuestionId == id).ToListAsync();
        foreach (var tag in current.Where(t => !wanted.Contains(t.TagId)))
        {
            tag.IsDeleted = true;
            tag.DeletedAt = now;
        }

        foreach (var tagId in wanted.Except(current.Select(t => t.TagId)))
        {
            db.InterviewQuestionTags.Add(new InterviewQuestionTag { UserId = question.UserId, InterviewQuestionId = id, TagId = tagId });
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<InterviewQuestionDto>.Fail("This question was changed somewhere else at the same time. Reload and try again.");
        }

        return await GetAsync(id);
    }

    public async Task<OperationResult<InterviewQuestionDto>> PractisedAsync(int id, DateOnly today)
    {
        if (today == default)
        {
            return OperationResult<InterviewQuestionDto>.Fail("Today's date is required.");
        }

        var question = await db.InterviewQuestions.FindAsync(id);
        if (question is null)
        {
            return OperationResult<InterviewQuestionDto>.Fail(NotFound);
        }

        question.LastPractisedOn = today;
        question.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var question = await db.InterviewQuestions.FindAsync(id);
        if (question is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.InterviewQuestionTags.Where(t => t.InterviewQuestionId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.IsDeleted, true).SetProperty(t => t.DeletedAt, now));
        question.IsDeleted = true;
        question.DeletedAt = now;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(InterviewQuestionLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(InterviewQuestionLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<string?> ApplyAsync(InterviewQuestion question, InterviewQuestionRequest request)
    {
        var text = request.Question.Trim();
        if (text.Length == 0)
        {
            return "Write the question.";
        }

        if (request.JobApplicationId is { } applicationId && !await db.JobApplications.AnyAsync(a => a.Id == applicationId))
        {
            return "Application not found.";
        }

        var tagIds = request.TagIds.Distinct().ToList();
        if (tagIds.Count > 0 && await db.Tags.CountAsync(t => tagIds.Contains(t.Id)) != tagIds.Count)
        {
            return "Tag not found.";
        }

        question.Question = text;
        question.Answer = string.IsNullOrWhiteSpace(request.Answer) ? null : request.Answer.Trim();
        question.ReviewNotes = string.IsNullOrWhiteSpace(request.ReviewNotes) ? null : request.ReviewNotes.Trim();
        question.JobApplicationId = request.JobApplicationId;
        return null;
    }

    private static readonly Expression<Func<InterviewQuestion, InterviewQuestionDto>> ToDto = q => new InterviewQuestionDto
    {
        Id = q.Id,
        Question = q.Question,
        Answer = q.Answer,
        ReviewNotes = q.ReviewNotes,
        LastPractisedOn = q.LastPractisedOn,
        JobApplicationId = q.JobApplicationId,
        ApplicationTitle = q.JobApplication != null ? q.JobApplication.Role + " at " + q.JobApplication.Organisation : null,
        Tags = q.InterviewQuestionTags.OrderBy(t => t.Tag.Name).Select(t => new TagDto { Id = t.TagId, Name = t.Tag.Name }).ToList(),
    };
}

/// <summary>Questions can be linked, have reminders and be found by search (by the question or your answer).</summary>
public class InterviewQuestionLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "InterviewQuestion";

    public string EntityType => Type;

    public string DisplayName => "Interview question";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.InterviewQuestions.Where(q => ids.Contains(q.Id)).ToDictionaryAsync(q => q.Id, q => q.Question);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.InterviewQuestions.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(q => q.Question.Contains(search) || (q.Answer != null && q.Answer.Contains(search)));
        }

        return await query
            .OrderByDescending(q => q.UpdatedAt ?? q.CreatedAt)
            .Take(take)
            .Select(q => new LinkableItemDto { EntityType = Type, EntityId = q.Id, Title = q.Question })
            .ToListAsync();
    }
}
