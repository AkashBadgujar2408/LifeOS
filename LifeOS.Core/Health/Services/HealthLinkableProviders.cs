using System.Globalization;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace LifeOS.Core.Health.Services;

/// <summary>
/// Health items can be linked, have reminders and be found by search — but only while the vault is unlocked: locked,
/// search finds none of them and titles are a neutral word ("Doctor visit"), because links, reminders and search
/// show outside the Health pages. The vault is resolved per call: <c>VaultService</c> itself takes every provider.
/// </summary>
public abstract class HealthLinkableProvider(AppDbContext db, IServiceProvider services) : ILinkableEntityProvider
{
    protected AppDbContext Db => db;

    public abstract string EntityType { get; }

    public abstract string DisplayName { get; }

    private bool Unlocked => services.GetRequiredService<IVaultService>().IsUnlocked;

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids)
    {
        var titles = await TitlesAsync(ids);
        return Unlocked ? titles : titles.ToDictionary(t => t.Key, _ => DisplayName);
    }

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take) =>
        Unlocked ? await FindAsync(search, take) : [];

    protected abstract Task<Dictionary<int, string>> TitlesAsync(IReadOnlyCollection<int> ids);

    protected abstract Task<List<LinkableItemDto>> FindAsync(string? search, int take);

    protected static string Day(DateOnly day) => day.ToString("dd'/'MMM'/'yyyy", CultureInfo.InvariantCulture);
}

/// <summary>A visit titled "Knee pain · 14/Oct/2026" (found by reason, doctor or place).</summary>
public class DoctorVisitLinkableProvider(AppDbContext db, IServiceProvider services) : HealthLinkableProvider(db, services)
{
    public const string Type = "DoctorVisit";

    public override string EntityType => Type;

    public override string DisplayName => "Doctor visit";

    protected override async Task<Dictionary<int, string>> TitlesAsync(IReadOnlyCollection<int> ids) =>
        (await Db.DoctorVisits.Where(v => ids.Contains(v.Id)).Select(v => new { v.Id, v.Reason, v.VisitOn }).ToListAsync())
        .ToDictionary(v => v.Id, v => $"{v.Reason} · {Day(v.VisitOn)}");

    protected override async Task<List<LinkableItemDto>> FindAsync(string? search, int take)
    {
        var query = Db.DoctorVisits.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(v => v.Reason.Contains(search) || (v.Place != null && v.Place.Contains(search))
                || (v.Contact != null && v.Contact.Name.Contains(search)));
        }

        return (await query.OrderByDescending(v => v.VisitOn).Take(take).Select(v => new { v.Id, v.Reason, v.VisitOn }).ToListAsync())
            .Select(v => new LinkableItemDto { EntityType = Type, EntityId = v.Id, Title = $"{v.Reason} · {Day(v.VisitOn)}" })
            .ToList();
    }
}

public class MedicationLinkableProvider(AppDbContext db, IServiceProvider services) : HealthLinkableProvider(db, services)
{
    public const string Type = "Medication";

    public override string EntityType => Type;

    public override string DisplayName => "Medicine";

    protected override async Task<Dictionary<int, string>> TitlesAsync(IReadOnlyCollection<int> ids) =>
        (await Db.Medications.Where(m => ids.Contains(m.Id)).Select(m => new { m.Id, m.Name, m.Strength }).ToListAsync())
        .ToDictionary(m => m.Id, m => m.Strength is null ? m.Name : $"{m.Name} {m.Strength}");

    protected override async Task<List<LinkableItemDto>> FindAsync(string? search, int take)
    {
        var query = Db.Medications.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(m => m.Name.Contains(search));
        }

        return await query.OrderBy(m => m.EndDate != null).ThenBy(m => m.Name).Take(take)
            .Select(m => new LinkableItemDto { EntityType = Type, EntityId = m.Id, Title = m.Strength == null ? m.Name : m.Name + " " + m.Strength })
            .ToListAsync();
    }
}

public class MedicalConditionLinkableProvider(AppDbContext db, IServiceProvider services) : HealthLinkableProvider(db, services)
{
    public const string Type = "MedicalCondition";

    public override string EntityType => Type;

    public override string DisplayName => "Medical history";

    protected override async Task<Dictionary<int, string>> TitlesAsync(IReadOnlyCollection<int> ids) =>
        await Db.MedicalConditions.Where(c => ids.Contains(c.Id)).ToDictionaryAsync(c => c.Id, c => c.Name);

    protected override async Task<List<LinkableItemDto>> FindAsync(string? search, int take)
    {
        var query = Db.MedicalConditions.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(c => c.Name.Contains(search));
        }

        return await query.OrderBy(c => c.Name).Take(take)
            .Select(c => new LinkableItemDto { EntityType = Type, EntityId = c.Id, Title = c.Name })
            .ToListAsync();
    }
}

/// <summary>A lab result titled "HbA1c · 14/Oct/2026".</summary>
public class LabResultLinkableProvider(AppDbContext db, IServiceProvider services) : HealthLinkableProvider(db, services)
{
    public const string Type = "LabResult";

    public override string EntityType => Type;

    public override string DisplayName => "Lab result";

    protected override async Task<Dictionary<int, string>> TitlesAsync(IReadOnlyCollection<int> ids) =>
        (await Db.LabResults.Where(r => ids.Contains(r.Id)).Select(r => new { r.Id, r.TestName, r.TakenOn }).ToListAsync())
        .ToDictionary(r => r.Id, r => $"{r.TestName} · {Day(r.TakenOn)}");

    protected override async Task<List<LinkableItemDto>> FindAsync(string? search, int take)
    {
        var query = Db.LabResults.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(r => r.TestName.Contains(search) || (r.Laboratory != null && r.Laboratory.Contains(search)));
        }

        return (await query.OrderByDescending(r => r.TakenOn).Take(take).Select(r => new { r.Id, r.TestName, r.TakenOn }).ToListAsync())
            .Select(r => new LinkableItemDto { EntityType = Type, EntityId = r.Id, Title = $"{r.TestName} · {Day(r.TakenOn)}" })
            .ToList();
    }
}
