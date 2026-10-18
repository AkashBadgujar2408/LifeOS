using LifeOS.Core.Calendar.DTOs;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Documents.Services;
using LifeOS.Core.Learning.DTOs;
using LifeOS.Core.Learning.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Story.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Learning.Services;

/// <summary>
/// Certifications and their renewal reminder — the same pattern as a document's expiry reminder: one ordinary
/// reminder about the certification, at 09:00 in the Settings zone N days before it expires, kept in step here
/// (moved with the date, made pending again when it moves, removed when switched off). Don't create renewal
/// reminders anywhere else.
/// </summary>
public class CertificationsService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService)
    : ICertificationsService
{
    private const string NotFound = "Certification not found.";

    public async Task<List<CertificationDto>> GetAllAsync() =>
        await db.Certifications
            // Expiring soonest first, then the ones that never expire, newest issued first.
            .OrderBy(c => c.ExpiresOn == null).ThenBy(c => c.ExpiresOn).ThenByDescending(c => c.IssuedOn).ThenBy(c => c.Name)
            .Select(ToDto)
            .ToListAsync();

    public async Task<OperationResult<CertificationDto>> GetAsync(int id)
    {
        var certification = await db.Certifications.Where(c => c.Id == id).Select(ToDto).FirstOrDefaultAsync();
        return certification is null ? OperationResult<CertificationDto>.Fail(NotFound) : OperationResult<CertificationDto>.Ok(certification);
    }

    public async Task<OperationResult<CertificationDto>> CreateAsync(CertificationRequest request)
    {
        var certification = new Certification { UserId = db.CurrentUserId!.Value };
        var error = await ApplyAsync(certification, request);
        if (error is not null)
        {
            return OperationResult<CertificationDto>.Fail(error);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        db.Certifications.Add(certification);
        await db.SaveChangesAsync();
        var reminderError = await SyncRenewalReminderAsync(certification, request.TimeZone);
        if (reminderError is not null)
        {
            return OperationResult<CertificationDto>.Fail(reminderError);
        }

        await transaction.CommitAsync();
        return await GetAsync(certification.Id);
    }

    public async Task<OperationResult<CertificationDto>> UpdateAsync(int id, CertificationRequest request)
    {
        var certification = await db.Certifications.FirstOrDefaultAsync(c => c.Id == id);
        if (certification is null)
        {
            return OperationResult<CertificationDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(certification, request);
        if (error is not null)
        {
            return OperationResult<CertificationDto>.Fail(error);
        }

        certification.UpdatedAt = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.SaveChangesAsync();
        var reminderError = await SyncRenewalReminderAsync(certification, request.TimeZone);
        if (reminderError is not null)
        {
            return OperationResult<CertificationDto>.Fail(reminderError);
        }

        await transaction.CommitAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var certification = await db.Certifications.FirstOrDefaultAsync(c => c.Id == id);
        if (certification is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        certification.IsDeleted = true;
        certification.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(CertificationLinkableProvider.Type, id);
        // Includes the renewal reminder.
        await remindersService.RemoveAllForEntityAsync(CertificationLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<string?> ApplyAsync(Certification certification, CertificationRequest request)
    {
        var name = request.Name.Trim();
        if (name.Length == 0)
        {
            return "Name the certification.";
        }

        if (request.IssuedOn == default)
        {
            return "When was it issued?";
        }

        if (request.ExpiresOn is { } expires && expires < request.IssuedOn)
        {
            return "It can't expire before it was issued.";
        }

        if (request.RenewalReminderDays is not null && request.ExpiresOn is null)
        {
            return "A renewal reminder needs an expiry date.";
        }

        if (request.TimeZone is { } zone && !string.IsNullOrWhiteSpace(zone) && !LifeStoryService.TryFindZone(zone, out _))
        {
            return LifeStoryService.UnknownZone(zone);
        }

        if (request.SkillId is { } skillId && !await db.Skills.AnyAsync(s => s.Id == skillId))
        {
            return "Skill not found.";
        }

        if (request.CourseId is { } courseId && !await db.Courses.AnyAsync(c => c.Id == courseId))
        {
            return "Course not found.";
        }

        certification.Name = name;
        certification.Issuer = Clean(request.Issuer);
        certification.CredentialId = Clean(request.CredentialId);
        certification.Url = Clean(request.Url);
        certification.IssuedOn = request.IssuedOn;
        certification.ExpiresOn = request.ExpiresOn;
        certification.RenewalReminderDays = request.RenewalReminderDays;
        certification.SkillId = request.SkillId;
        certification.CourseId = request.CourseId;
        return null;
    }

    private async Task<string?> SyncRenewalReminderAsync(Certification certification, string? requestZone)
    {
        var existing = certification.RenewalReminderId is { } reminderId ? (await remindersService.GetAsync(reminderId)).Data : null;

        if (certification.ExpiresOn is not { } expiresOn || certification.RenewalReminderDays is not { } days)
        {
            if (existing is not null)
            {
                await remindersService.DeleteAsync(existing.Id);
            }

            if (certification.RenewalReminderId is not null)
            {
                certification.RenewalReminderId = null;
                await db.SaveChangesAsync();
            }

            return null;
        }

        var zone = await ReminderZoneAsync(requestZone);
        var request = new ReminderRequest
        {
            Title = DocumentRules.ExpiryReminderTitle(certification.Name, expiresOn),
            Notes = "Time to renew it: book the exam or the course, or send the paperwork.",
            RemindAt = DocumentRules.ExpiryReminderAt(expiresOn, days, zone),
            EntityType = CertificationLinkableProvider.Type,
            EntityId = certification.Id,
        };

        if (existing is null)
        {
            var created = await remindersService.CreateAsync(request);
            if (!created.Success)
            {
                return created.Error;
            }

            certification.RenewalReminderId = created.Data!.Id;
            await db.SaveChangesAsync();
            return null;
        }

        var moved = existing.RemindAt != request.RemindAt;
        if (moved || existing.Title != request.Title)
        {
            var updated = await remindersService.UpdateAsync(existing.Id, request);
            if (!updated.Success)
            {
                return updated.Error;
            }

            // A new date is a new reminder as far as the user is concerned, even if they'd dealt with the old one.
            if (moved && existing.DismissedAt is not null)
            {
                await remindersService.SetDismissedAsync(existing.Id, false);
            }
        }

        return null;
    }

    /// <summary>The Settings zone if there is one, else the browser's, else UTC.</summary>
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

    private static string? Clean(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();

    private static readonly System.Linq.Expressions.Expression<Func<Certification, CertificationDto>> ToDto = c => new CertificationDto
    {
        Id = c.Id,
        Name = c.Name,
        Issuer = c.Issuer,
        CredentialId = c.CredentialId,
        Url = c.Url,
        IssuedOn = c.IssuedOn,
        ExpiresOn = c.ExpiresOn,
        RenewalReminderDays = c.RenewalReminderDays,
        SkillId = c.SkillId,
        SkillName = c.Skill != null ? c.Skill.Name : null,
        CourseId = c.CourseId,
        CourseTitle = c.Course != null ? c.Course.Title : null,
    };
}
