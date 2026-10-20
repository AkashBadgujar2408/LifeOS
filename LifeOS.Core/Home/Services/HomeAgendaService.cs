using LifeOS.Core.Home.DTOs;
using LifeOS.Core.Home.ServiceContracts;
using LifeOS.Core.Models;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Home.Services;

/// <summary>
/// What needs attention at home soon, for the Home overview and My Day: warranties/AMCs, PUCs and registrations
/// running out (<see cref="HomeRules.ExpiryInWindow"/>), maintenance due (<see cref="HomeRules.MaintenanceInWindow"/>) and unpaid
/// bills due within 14 days or overdue (Session 68).
/// Things you no longer have (disposed) and paused maintenance are left out. Computed per request, nothing stored.
/// </summary>
public class HomeAgendaService(AppDbContext db) : IHomeAgendaService
{
    public async Task<List<HomeAgendaItemDto>> UpcomingAsync(DateOnly today)
    {
        var from = today.AddDays(-HomeRules.ExpiredShownDays);
        var to = today.AddDays(HomeRules.ExpirySoonDays);
        var items = new List<HomeAgendaItemDto>();

        var warranties = await db.Warranties
            .Where(w => w.ExpiresOn >= from && w.ExpiresOn <= to)
            .Where(w => !(w.Asset != null && w.Asset.DisposedOn != null) && !(w.Vehicle != null && w.Vehicle.DisposedOn != null))
            .Select(w => new
            {
                w.Id,
                w.Kind,
                w.ExpiresOn,
                Name = w.Asset != null ? w.Asset.Name : w.Vehicle != null ? w.Vehicle.Name : w.Property != null ? w.Property.Name : "",
            })
            .ToListAsync();
        items.AddRange(warranties.Select(w => new HomeAgendaItemDto
        {
            Kind = HomeAgendaKinds.Warranty,
            EntityType = WarrantyLinkableProvider.Type,
            EntityId = w.Id,
            Title = w.Name + (w.Kind == "AMC" ? " AMC" : " warranty"),
            On = w.ExpiresOn,
        }));

        var vehicles = await db.Vehicles
            .Where(v => v.DisposedOn == null)
            .Where(v => (v.PucValidUntil >= from && v.PucValidUntil <= to) || (v.RegistrationValidUntil >= from && v.RegistrationValidUntil <= to))
            .Select(v => new { v.Id, v.Name, v.PucValidUntil, v.RegistrationValidUntil })
            .ToListAsync();
        foreach (var v in vehicles)
        {
            if (v.PucValidUntil is { } puc && HomeRules.ExpiryInWindow(puc, today))
            {
                items.Add(new HomeAgendaItemDto
                {
                    Kind = HomeAgendaKinds.Puc, EntityType = VehicleLinkableProvider.Type, EntityId = v.Id, Title = v.Name + " PUC", On = puc,
                });
            }

            if (v.RegistrationValidUntil is { } reg && HomeRules.ExpiryInWindow(reg, today))
            {
                items.Add(new HomeAgendaItemDto
                {
                    Kind = HomeAgendaKinds.Registration, EntityType = VehicleLinkableProvider.Type, EntityId = v.Id,
                    Title = v.Name + " registration", On = reg,
                });
            }
        }

        var maintenance = await db.MaintenanceTasks
            .Where(m => !m.IsPaused)
            .Select(m => new
            {
                m.Id,
                m.Title,
                m.RecurrenceFrequency,
                m.RecurrenceInterval,
                m.FirstDueOn,
                LastDoneOn = m.MaintenanceLogs.Max(l => (DateOnly?)l.DoneOn),
            })
            .ToListAsync();
        items.AddRange(maintenance
            .Select(m => (m.Id, m.Title, Next: HomeRules.NextDue(m.RecurrenceFrequency, m.RecurrenceInterval, m.FirstDueOn, m.LastDoneOn)))
            .Where(m => HomeRules.MaintenanceInWindow(m.Next, today))
            .Select(m => new HomeAgendaItemDto
            {
                Kind = HomeAgendaKinds.Maintenance, EntityType = MaintenanceTaskLinkableProvider.Type, EntityId = m.Id, Title = m.Title, On = m.Next,
            }));

        var bills = await db.UtilityBills
            .Where(b => b.PaidOn == null)
            .Select(b => new { b.Id, Name = b.Provider ?? b.Kind, b.DueOn })
            .ToListAsync();
        items.AddRange(bills.Where(b => HomeRules.BillInWindow(b.DueOn, today)).Select(b => new HomeAgendaItemDto
        {
            Kind = HomeAgendaKinds.Bill, EntityType = UtilityBillLinkableProvider.Type, EntityId = b.Id, Title = b.Name + " bill", On = b.DueOn,
        }));

        return items.OrderBy(i => i.On).ThenBy(i => i.Title, StringComparer.Ordinal).ThenBy(i => i.EntityId).ToList();
    }
}
