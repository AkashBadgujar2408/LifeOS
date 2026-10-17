using LifeOS.Core.Calendar.DTOs;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Journal.DTOs;
using LifeOS.Core.Journal.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Story.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Journal.Services;

public class DecisionsService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService)
    : IDecisionsService
{
    private const string NotFound = DecisionErrors.NotFound;

    public async Task<List<DecisionDto>> ListAsync(DateOnly? day)
    {
        var query = db.Decisions.AsNoTracking();
        if (day is { } d)
        {
            query = query.Where(x => x.DecidedOn == d);
        }

        return await query
            .OrderByDescending(x => x.DecidedOn).ThenByDescending(x => x.Id)
            .Select(ToDtoExpression)
            .ToListAsync();
    }

    public async Task<OperationResult<DecisionDto>> GetAsync(int id)
    {
        var decision = await db.Decisions.AsNoTracking().Where(x => x.Id == id).Select(ToDtoExpression).FirstOrDefaultAsync();
        return decision is null ? OperationResult<DecisionDto>.Fail(NotFound) : OperationResult<DecisionDto>.Ok(decision);
    }

    public async Task<OperationResult<DecisionDto>> CreateAsync(DecisionRequest request)
    {
        var error = Validate(request, reviewedOn: null);
        if (error is not null)
        {
            return OperationResult<DecisionDto>.Fail(error);
        }

        var decision = new Decision { UserId = db.CurrentUserId!.Value };
        Apply(decision, request);

        await using var transaction = await db.Database.BeginTransactionAsync();
        db.Decisions.Add(decision);
        await db.SaveChangesAsync();
        var reminderError = await SyncReviewReminderAsync(decision, request.TimeZone);
        if (reminderError is not null)
        {
            return OperationResult<DecisionDto>.Fail(reminderError);
        }

        await transaction.CommitAsync();
        return await GetAsync(decision.Id);
    }

    public async Task<OperationResult<DecisionDto>> UpdateAsync(int id, DecisionRequest request)
    {
        var decision = await db.Decisions.FirstOrDefaultAsync(x => x.Id == id);
        if (decision is null)
        {
            return OperationResult<DecisionDto>.Fail(NotFound);
        }

        var error = Validate(request, decision.ReviewedOn);
        if (error is not null)
        {
            return OperationResult<DecisionDto>.Fail(error);
        }

        Apply(decision, request);
        decision.UpdatedAt = DateTime.UtcNow;

        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.SaveChangesAsync();
        var reminderError = await SyncReviewReminderAsync(decision, request.TimeZone);
        if (reminderError is not null)
        {
            return OperationResult<DecisionDto>.Fail(reminderError);
        }

        await transaction.CommitAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<DecisionDto>> RecordOutcomeAsync(int id, DecisionOutcomeRequest request)
    {
        var decision = await db.Decisions.FirstOrDefaultAsync(x => x.Id == id);
        if (decision is null)
        {
            return OperationResult<DecisionDto>.Fail(NotFound);
        }

        var outcome = string.IsNullOrWhiteSpace(request.ActualOutcome) ? null : request.ActualOutcome.Trim();
        var reopened = outcome is null && decision.ReviewedOn is not null;
        if (outcome is null)
        {
            // Blank: open again (the review reminder comes back if its day is still ahead or not dealt with).
            decision.ActualOutcome = null;
            decision.Verdict = null;
            decision.ReviewedOn = null;
        }
        else
        {
            if (request.Verdict is not null && !DecisionVerdicts.All.Contains(request.Verdict))
            {
                return OperationResult<DecisionDto>.Fail($"Verdict must be one of {string.Join(", ", DecisionVerdicts.All)}.");
            }

            var today = request.Today!.Value;
            if (today < decision.DecidedOn)
            {
                return OperationResult<DecisionDto>.Fail("An outcome can't be recorded before the decision was made.");
            }

            decision.ActualOutcome = outcome;
            decision.Verdict = request.Verdict;
            // Rewriting an outcome keeps the day it was first recorded.
            decision.ReviewedOn ??= today;
        }

        decision.UpdatedAt = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.SaveChangesAsync();
        var reminderError = await SyncReviewReminderAsync(decision, request.TimeZone, reopened);
        if (reminderError is not null)
        {
            return OperationResult<DecisionDto>.Fail(reminderError);
        }

        await transaction.CommitAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var decision = await db.Decisions.FirstOrDefaultAsync(x => x.Id == id);
        if (decision is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        decision.IsDeleted = true;
        decision.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(DecisionLinkableProvider.Type, id);
        // Includes the review reminder.
        await remindersService.RemoveAllForEntityAsync(DecisionLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private static string? Validate(DecisionRequest request, DateOnly? reviewedOn)
    {
        if (request.Title.Trim().Length == 0)
        {
            return "Say what you decided.";
        }

        var decidedOn = request.DecidedOn!.Value;
        if (request.ReviewOn is { } reviewOn && reviewOn < decidedOn)
        {
            return "The review day can't be before the decision.";
        }

        return reviewedOn is { } reviewed && reviewed < decidedOn
            ? "It was already reviewed before that day; clear the outcome first."
            : null;
    }

    private static void Apply(Decision decision, DecisionRequest request)
    {
        decision.DecidedOn = request.DecidedOn!.Value;
        decision.Title = request.Title.Trim();
        decision.Reasons = string.IsNullOrWhiteSpace(request.Reasons) ? null : request.Reasons.Trim();
        decision.ExpectedOutcome = string.IsNullOrWhiteSpace(request.ExpectedOutcome) ? null : request.ExpectedOutcome.Trim();
        decision.ReviewOn = request.ReviewOn;
    }

    /// <summary>
    /// Keeps the one review reminder in step: written when a review day is set, moved (and made pending again) when it
    /// changes, dismissed once the outcome is recorded (so it stays in the reminder history), removed when there's no
    /// review day. A reminder the user dismissed themselves stays dismissed unless the review day moves or the decision
    /// is reopened. Returns an error or null.
    /// </summary>
    private async Task<string?> SyncReviewReminderAsync(Decision decision, string? requestZone, bool reopened = false)
    {
        var existing = decision.ReviewReminderId is { } reminderId ? (await remindersService.GetAsync(reminderId)).Data : null;

        if (decision.ReviewOn is not { } reviewOn)
        {
            if (existing is not null)
            {
                await remindersService.DeleteAsync(existing.Id);
            }

            if (decision.ReviewReminderId is not null)
            {
                decision.ReviewReminderId = null;
                await db.SaveChangesAsync();
            }

            return null;
        }

        var zone = await ReminderZoneAsync(requestZone);
        var request = new ReminderRequest
        {
            Title = DecisionRules.ReviewReminderTitle(decision.Title),
            Notes = DecisionRules.ReviewReminderNotes(decision.DecidedOn, decision.ExpectedOutcome),
            RemindAt = DecisionRules.ReviewReminderAt(reviewOn, zone),
            EntityType = DecisionLinkableProvider.Type,
            EntityId = decision.Id,
        };
        var reviewed = decision.ReviewedOn is not null;

        if (existing is null)
        {
            if (reviewed)
            {
                // Already settled: no reminder to write.
                return null;
            }

            var created = await remindersService.CreateAsync(request);
            if (!created.Success)
            {
                return created.Error;
            }

            decision.ReviewReminderId = created.Data!.Id;
            await db.SaveChangesAsync();
            return null;
        }

        var moved = existing.RemindAt != request.RemindAt;
        if (moved || existing.Title != request.Title || existing.Notes != request.Notes)
        {
            var updated = await remindersService.UpdateAsync(existing.Id, request);
            if (!updated.Success)
            {
                return updated.Error;
            }
        }

        // Reviewed → dealt with. Reopened, or open with a new review day → pending again.
        var isDismissed = existing.DismissedAt is not null;
        if (reviewed && !isDismissed)
        {
            await remindersService.SetDismissedAsync(existing.Id, true);
        }
        else if (!reviewed && isDismissed && (moved || reopened))
        {
            await remindersService.SetDismissedAsync(existing.Id, false);
        }

        return null;
    }

    /// <summary>The zone chosen in Settings, else the browser's (sent with the request), else UTC.</summary>
    private async Task<TimeZoneInfo> ReminderZoneAsync(string? requestZone)
    {
        var preferred = await db.Users.Where(u => u.Id == db.CurrentUserId).Select(u => u.TimeZone).FirstOrDefaultAsync();
        foreach (var candidate in new[] { preferred, requestZone })
        {
            if (!string.IsNullOrWhiteSpace(candidate) && LifeStoryService.TryFindZone(candidate, out var zone))
            {
                return zone;
            }
        }

        return TimeZoneInfo.Utc;
    }

    private static readonly System.Linq.Expressions.Expression<Func<Decision, DecisionDto>> ToDtoExpression = d => new DecisionDto
    {
        Id = d.Id,
        DecidedOn = d.DecidedOn,
        Title = d.Title,
        Reasons = d.Reasons,
        ExpectedOutcome = d.ExpectedOutcome,
        ReviewOn = d.ReviewOn,
        ReviewReminderId = d.ReviewReminderId,
        ActualOutcome = d.ActualOutcome,
        Verdict = d.Verdict,
        ReviewedOn = d.ReviewedOn,
        CreatedAt = d.CreatedAt,
        UpdatedAt = d.UpdatedAt,
    };
}
