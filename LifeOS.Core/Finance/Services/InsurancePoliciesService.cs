using System.Linq.Expressions;
using LifeOS.Core.Calendar.DTOs;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Career.Services;
using LifeOS.Core.Documents.Services;
using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Story.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Finance.Services;

/// <summary>
/// Insurance policies and their renewal reminder — the same pattern as a certification's: one ordinary reminder about
/// the policy, at 09:00 in the Settings zone N days before it renews, kept in step here (moved with the date, pending
/// again when it moves, removed when switched off). Don't create renewal reminders anywhere else. The policy document
/// itself is a Documents item linked to the policy.
/// </summary>
public class InsurancePoliciesService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService)
    : IInsurancePoliciesService
{
    private const string NotFound = "Policy not found.";

    public async Task<List<InsurancePolicyDto>> GetAllAsync()
    {
        // Renewing soonest first, then the ones with no renewal date; ended ones last.
        var policies = await db.InsurancePolicies
            .OrderBy(p => p.RenewsOn == null).ThenBy(p => p.RenewsOn).ThenBy(p => p.Name)
            .Select(ToDto)
            .ToListAsync();
        policies.ForEach(Fill);
        return policies;
    }

    public async Task<OperationResult<InsurancePolicyDto>> GetAsync(int id)
    {
        var policy = await db.InsurancePolicies.Where(p => p.Id == id).Select(ToDto).FirstOrDefaultAsync();
        if (policy is null)
        {
            return OperationResult<InsurancePolicyDto>.Fail(NotFound);
        }

        Fill(policy);
        return OperationResult<InsurancePolicyDto>.Ok(policy);
    }

    public async Task<OperationResult<InsurancePolicyDto>> CreateAsync(InsurancePolicyRequest request)
    {
        var policy = new InsurancePolicy { UserId = db.CurrentUserId!.Value };
        var error = await ApplyAsync(policy, request);
        if (error is not null)
        {
            return OperationResult<InsurancePolicyDto>.Fail(error);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        db.InsurancePolicies.Add(policy);
        await db.SaveChangesAsync();
        var reminderError = await SyncRenewalReminderAsync(policy, request.TimeZone);
        if (reminderError is not null)
        {
            return OperationResult<InsurancePolicyDto>.Fail(reminderError);
        }

        await transaction.CommitAsync();
        return await GetAsync(policy.Id);
    }

    public async Task<OperationResult<InsurancePolicyDto>> UpdateAsync(int id, InsurancePolicyRequest request)
    {
        var policy = await db.InsurancePolicies.FirstOrDefaultAsync(p => p.Id == id);
        if (policy is null)
        {
            return OperationResult<InsurancePolicyDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(policy, request);
        if (error is not null)
        {
            return OperationResult<InsurancePolicyDto>.Fail(error);
        }

        policy.UpdatedAt = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.SaveChangesAsync();
        var reminderError = await SyncRenewalReminderAsync(policy, request.TimeZone);
        if (reminderError is not null)
        {
            return OperationResult<InsurancePolicyDto>.Fail(reminderError);
        }

        await transaction.CommitAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var policy = await db.InsurancePolicies.FirstOrDefaultAsync(p => p.Id == id);
        if (policy is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        // A vehicle it covered stays, just without insurance on record.
        await db.Vehicles.Where(v => v.InsurancePolicyId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(v => v.InsurancePolicyId, (int?)null).SetProperty(v => v.UpdatedAt, DateTime.UtcNow));
        policy.IsDeleted = true;
        policy.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        // The linked policy document stays in Documents; only the link goes.
        await entityLinksService.RemoveAllForEntityAsync(InsurancePolicyLinkableProvider.Type, id);
        // Includes the renewal reminder.
        await remindersService.RemoveAllForEntityAsync(InsurancePolicyLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<string?> ApplyAsync(InsurancePolicy policy, InsurancePolicyRequest request)
    {
        var name = request.Name.Trim();
        if (name.Length == 0)
        {
            return "Name the policy (e.g. Family health cover).";
        }

        var currency = CareerRules.Currency(request.Currency);
        var frequency = string.IsNullOrWhiteSpace(request.PremiumFrequency) ? null : request.PremiumFrequency;
        var error = ProtectionRules.CheckPolicy(
            request.Kind, currency, request.SumAssured, request.Premium, frequency,
            request.StartDate, request.RenewsOn, request.EndsOn, request.RenewalReminderDays);
        if (error is not null)
        {
            return error;
        }

        if (request.TimeZone is { } zone && !string.IsNullOrWhiteSpace(zone) && !LifeStoryService.TryFindZone(zone, out _))
        {
            return LifeStoryService.UnknownZone(zone);
        }

        if (request.ContactId is { } contactId && !await db.Contacts.AnyAsync(c => c.Id == contactId))
        {
            return "Contact not found.";
        }

        policy.Name = name;
        policy.Kind = request.Kind;
        policy.Insurer = Clean(request.Insurer);
        policy.PolicyNumberLast4 = DocumentRules.Last4(request.Number);
        policy.Currency = currency!;
        policy.SumAssured = request.SumAssured;
        policy.Premium = request.Premium;
        policy.PremiumFrequency = frequency;
        policy.StartDate = request.StartDate;
        policy.RenewsOn = request.RenewsOn;
        policy.EndsOn = request.EndsOn;
        policy.ContactId = request.ContactId;
        policy.Notes = Clean(request.Notes);
        policy.RenewalReminderDays = request.RenewalReminderDays;
        return null;
    }

    private async Task<string?> SyncRenewalReminderAsync(InsurancePolicy policy, string? requestZone)
    {
        var existing = policy.RenewalReminderId is { } reminderId ? (await remindersService.GetAsync(reminderId)).Data : null;

        if (policy.RenewsOn is not { } renewsOn || policy.RenewalReminderDays is not { } days)
        {
            if (existing is not null)
            {
                await remindersService.DeleteAsync(existing.Id);
            }

            if (policy.RenewalReminderId is not null)
            {
                policy.RenewalReminderId = null;
                await db.SaveChangesAsync();
            }

            return null;
        }

        var zone = await ReminderZoneAsync(requestZone);
        var request = new ReminderRequest
        {
            Title = ProtectionRules.RenewalReminderTitle(policy.Name, renewsOn),
            Notes = "Compare quotes, check the cover still fits and pay the renewal premium.",
            RemindAt = DocumentRules.ExpiryReminderAt(renewsOn, days, zone),
            EntityType = InsurancePolicyLinkableProvider.Type,
            EntityId = policy.Id,
        };

        if (existing is null)
        {
            var created = await remindersService.CreateAsync(request);
            if (!created.Success)
            {
                return created.Error;
            }

            policy.RenewalReminderId = created.Data!.Id;
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

            // A new renewal date is a new reminder as far as the user is concerned, even if they'd dealt with the old one.
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

    private static void Fill(InsurancePolicyDto policy) =>
        policy.AnnualPremium = ProtectionRules.AnnualPremium(policy.Premium, policy.PremiumFrequency);

    private static string? Clean(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();

    private static readonly Expression<Func<InsurancePolicy, InsurancePolicyDto>> ToDto = p => new InsurancePolicyDto
    {
        Id = p.Id,
        Name = p.Name,
        Kind = p.Kind,
        Insurer = p.Insurer,
        PolicyNumberLast4 = p.PolicyNumberLast4,
        Currency = p.Currency,
        SumAssured = p.SumAssured,
        Premium = p.Premium,
        PremiumFrequency = p.PremiumFrequency,
        StartDate = p.StartDate,
        RenewsOn = p.RenewsOn,
        EndsOn = p.EndsOn,
        ContactId = p.ContactId,
        ContactName = p.Contact != null ? p.Contact.Name : null,
        Notes = p.Notes,
        RenewalReminderDays = p.RenewalReminderDays,
    };
}

/// <summary>Policies can be linked (to their policy document), have reminders and be found by search (name or insurer).</summary>
public class InsurancePolicyLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "InsurancePolicy";

    public string EntityType => Type;

    public string DisplayName => "Insurance policy";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.InsurancePolicies.Where(p => ids.Contains(p.Id)).ToDictionaryAsync(p => p.Id, p => p.Name);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.InsurancePolicies.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(p => p.Name.Contains(search) || (p.Insurer != null && p.Insurer.Contains(search)));
        }

        return await query
            .OrderBy(p => p.Name)
            .Take(take)
            .Select(p => new LinkableItemDto { EntityType = Type, EntityId = p.Id, Title = p.Name })
            .ToListAsync();
    }
}
