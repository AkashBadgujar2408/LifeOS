using AutoMapper;
using AutoMapper.QueryableExtensions;
using LifeOS.Core.Calendar.DTOs;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Calendar.Services;

public class RemindersService(AppDbContext db, IMapper mapper, IEnumerable<ILinkableEntityProvider> providers)
    : IRemindersService
{
    private const string NotFound = "Reminder not found.";
    private const int DismissedLimit = 50;

    // Anything linkable can be a reminder's target, except an inbox item: it's a capture waiting to become something
    // real, and processing it would otherwise have to carry its reminders across too.
    private readonly Dictionary<string, ILinkableEntityProvider> targetProviders = providers
        .Where(p => p.EntityType != InboxLinkableProvider.Type)
        .ToDictionary(p => p.EntityType, StringComparer.OrdinalIgnoreCase);

    public async Task<OperationResult<List<ReminderDto>>> ListAsync(string status, string? entityType, int? entityId)
    {
        if ((entityType is null) != (entityId is null))
        {
            return OperationResult<List<ReminderDto>>.Fail("Filter by entity with both entityType and entityId.");
        }

        var query = db.Reminders.AsQueryable();
        if (entityType is not null)
        {
            query = query.Where(r => r.EntityType == entityType && r.EntityId == entityId);
        }

        query = status == ReminderStatuses.Dismissed
            ? query.Where(r => r.DismissedAt != null).OrderByDescending(r => r.DismissedAt).Take(DismissedLimit)
            : query.Where(r => r.DismissedAt == null).OrderBy(r => r.RemindAt).ThenBy(r => r.Id);

        return OperationResult<List<ReminderDto>>.Ok(await ToDtosAsync(query));
    }

    public async Task<List<ReminderDto>> GetDueAsync()
    {
        var now = DateTime.UtcNow;
        return await ToDtosAsync(db.Reminders
            .Where(r => r.DismissedAt == null && r.RemindAt <= now)
            .OrderBy(r => r.RemindAt)
            .ThenBy(r => r.Id));
    }

    public async Task<OperationResult<ReminderDto>> GetAsync(int id)
    {
        var reminders = await ToDtosAsync(db.Reminders.Where(r => r.Id == id));
        return reminders.Count == 0
            ? OperationResult<ReminderDto>.Fail(NotFound)
            : OperationResult<ReminderDto>.Ok(reminders[0]);
    }

    public async Task<OperationResult<ReminderDto>> CreateAsync(ReminderRequest request)
    {
        var reminder = new Reminder { UserId = db.CurrentUserId!.Value };
        var error = Apply(reminder, request);
        if (error is not null)
        {
            return OperationResult<ReminderDto>.Fail(error);
        }

        if ((request.EntityType is null) != (request.EntityId is null))
        {
            return OperationResult<ReminderDto>.Fail("A reminder target needs both entityType and entityId.");
        }

        if (request.EntityType is not null)
        {
            if (!targetProviders.TryGetValue(request.EntityType, out var provider))
            {
                return OperationResult<ReminderDto>.Fail($"Reminders can't be set on '{request.EntityType}' items.");
            }

            // The provider queries through the per-user filter, so another user's item is "not found" too.
            var titles = await provider.GetTitlesAsync([request.EntityId!.Value]);
            if (titles.Count == 0)
            {
                return OperationResult<ReminderDto>.Fail("The item this reminder is about was not found.");
            }

            reminder.EntityType = provider.EntityType;
            reminder.EntityId = request.EntityId;
        }

        db.Reminders.Add(reminder);
        await db.SaveChangesAsync();
        return await GetAsync(reminder.Id);
    }

    public async Task<OperationResult<ReminderDto>> UpdateAsync(int id, ReminderRequest request)
    {
        var reminder = await db.Reminders.FindAsync(id);
        if (reminder is null)
        {
            return OperationResult<ReminderDto>.Fail(NotFound);
        }

        var error = Apply(reminder, request);
        if (error is not null)
        {
            return OperationResult<ReminderDto>.Fail(error);
        }

        reminder.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<ReminderDto>> SetDismissedAsync(int id, bool dismissed)
    {
        var reminder = await db.Reminders.FindAsync(id);
        if (reminder is null)
        {
            return OperationResult<ReminderDto>.Fail(NotFound);
        }

        // Dismissing twice keeps the first time, so "dismissed at" stays truthful.
        if (dismissed != (reminder.DismissedAt is not null))
        {
            var now = DateTime.UtcNow;
            reminder.DismissedAt = dismissed ? now : null;
            reminder.UpdatedAt = now;
            await db.SaveChangesAsync();
        }

        return await GetAsync(id);
    }

    public async Task<OperationResult<ReminderDto>> SnoozeAsync(int id, DateTime until)
    {
        var reminder = await db.Reminders.FindAsync(id);
        if (reminder is null)
        {
            return OperationResult<ReminderDto>.Fail(NotFound);
        }

        if (until.Kind == DateTimeKind.Unspecified)
        {
            return OperationResult<ReminderDto>.Fail("The snooze time must include a timezone (send it as UTC).");
        }

        var now = DateTime.UtcNow;
        var untilUtc = until.ToUniversalTime();
        if (untilUtc <= now)
        {
            return OperationResult<ReminderDto>.Fail("Snooze until a time that's still to come.");
        }

        reminder.RemindAt = untilUtc;
        reminder.DismissedAt = null;
        reminder.UpdatedAt = now;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var reminder = await db.Reminders.FindAsync(id);
        if (reminder is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        reminder.IsDeleted = true;
        reminder.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task RemoveAllForEntityAsync(string entityType, int entityId)
    {
        var now = DateTime.UtcNow;
        await db.Reminders
            .Where(r => r.EntityType == entityType && r.EntityId == entityId)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.IsDeleted, true).SetProperty(r => r.DeletedAt, now));
    }

    /// <summary>Validates title/notes/time and copies them onto the entity; returns an error or null.</summary>
    private static string? Apply(Reminder reminder, ReminderRequest request)
    {
        var title = request.Title.Trim();
        if (title.Length == 0)
        {
            return "Title is required.";
        }

        if (request.RemindAt is null)
        {
            return "Pick when to be reminded.";
        }

        // Same rule as event times: without a "Z"/offset there's no telling which moment was meant.
        if (request.RemindAt.Value.Kind == DateTimeKind.Unspecified)
        {
            return "The reminder time must include a timezone (send it as UTC).";
        }

        reminder.Title = title;
        reminder.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        reminder.RemindAt = request.RemindAt.Value.ToUniversalTime();
        return null;
    }

    /// <summary>Runs the query and fills in each target's current title (one lookup per target type).</summary>
    private async Task<List<ReminderDto>> ToDtosAsync(IQueryable<Reminder> query)
    {
        var reminders = await query.ProjectTo<ReminderDto>(mapper.ConfigurationProvider).ToListAsync();

        foreach (var group in reminders.Where(r => r.EntityType is not null).GroupBy(r => r.EntityType!))
        {
            if (!targetProviders.TryGetValue(group.Key, out var provider))
            {
                continue;
            }

            var titles = await provider.GetTitlesAsync(group.Select(r => r.EntityId!.Value).Distinct().ToList());
            foreach (var reminder in group)
            {
                reminder.EntityTitle = titles.GetValueOrDefault(reminder.EntityId!.Value);
            }
        }

        return reminders;
    }
}
