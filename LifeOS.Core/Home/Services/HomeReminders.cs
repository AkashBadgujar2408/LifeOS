using LifeOS.Core.Calendar.DTOs;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Documents.Services;
using LifeOS.Core.Models;
using LifeOS.Core.Story.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Home.Services;

/// <summary>What a Home item's owned reminder should be: about which item, for which day, how many days before.</summary>
public sealed record OwnedReminder(string EntityType, int EntityId, DateOnly? Day, int? DaysBefore, string Title, string Notes);

/// <summary>
/// Keeps one owned reminder in step with a date on a Home item (a warranty's expiry, a vehicle's PUC / registration,
/// maintenance's next due day) — the same rules as insurance renewals: 09:00 in the Settings zone N days before, moved
/// with the date, pending again when the date moves, removed when there's no date or no "remind me". Home's services
/// call this; don't create these reminders anywhere else.
/// </summary>
public class HomeReminders(AppDbContext db, IRemindersService remindersService)
{
    /// <summary>Returns the reminder id to store (null: none) or an error.</summary>
    public async Task<(int? ReminderId, string? Error)> SyncAsync(int? reminderId, OwnedReminder wanted, string? requestZone)
    {
        var existing = reminderId is { } id ? (await remindersService.GetAsync(id)).Data : null;

        if (wanted.Day is not { } day || wanted.DaysBefore is not { } days)
        {
            if (existing is not null)
            {
                await remindersService.DeleteAsync(existing.Id);
            }

            return (null, null);
        }

        var zone = await ZoneAsync(requestZone);
        var request = new ReminderRequest
        {
            Title = wanted.Title,
            Notes = wanted.Notes,
            RemindAt = DocumentRules.ExpiryReminderAt(day, days, zone),
            EntityType = wanted.EntityType,
            EntityId = wanted.EntityId,
        };

        if (existing is null)
        {
            var created = await remindersService.CreateAsync(request);
            return created.Success ? (created.Data!.Id, null) : (null, created.Error);
        }

        var moved = existing.RemindAt != request.RemindAt;
        if (moved || existing.Title != request.Title)
        {
            var updated = await remindersService.UpdateAsync(existing.Id, request);
            if (!updated.Success)
            {
                return (existing.Id, updated.Error);
            }

            // A new date is a new reminder as far as the user is concerned, even if they'd dealt with the old one.
            if (moved && existing.DismissedAt is not null)
            {
                await remindersService.SetDismissedAsync(existing.Id, false);
            }
        }

        return (existing.Id, null);
    }

    /// <summary>The Settings zone if there is one, else the browser's, else UTC.</summary>
    private async Task<TimeZoneInfo> ZoneAsync(string? requestZone)
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

    /// <summary>A browser zone that was sent must be a real one.</summary>
    public static string? CheckZone(string? zone) =>
        zone is not null && !string.IsNullOrWhiteSpace(zone) && !LifeStoryService.TryFindZone(zone, out _)
            ? LifeStoryService.UnknownZone(zone)
            : null;
}
