using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Health.DTOs;
using LifeOS.Core.Health.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Health.Services;

/// <summary>
/// Medicines. Saving replaces the schedule as a whole, matched by time: a time that stays keeps its row (and so
/// its marked doses), a time that goes is soft-deleted (its doses stay as history). Doses are ticked like habit
/// days — one row per schedule per day, clearing soft-deletes it — and only on a day the dose was due
/// (<see cref="MedicationRules.CheckDose"/>). Adherence is computed on read, never stored.
/// </summary>
public class MedicationsService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService)
    : IMedicationsService
{
    private const string NotFound = "Medicine not found.";

    public async Task<List<MedicationDto>> GetAllAsync(DateOnly today)
    {
        var medications = await db.Medications.AsNoTracking()
            .Include(m => m.Condition)
            .Include(m => m.MedicationSchedules.Where(s => !s.IsDeleted))
            .AsSplitQuery()
            .ToListAsync();
        var doses = await RecentDosesAsync(medications.Select(m => m.Id).ToList(), today);
        return medications
            .Select(m => ToDto(m, doses, today))
            // Current first (by name), then the ones that ended, latest first.
            .OrderBy(d => d.EndDate is { } end && end < today).ThenByDescending(d => d.EndDate).ThenBy(d => d.Name)
            .ToList();
    }

    public async Task<OperationResult<MedicationDto>> GetAsync(int id, DateOnly today)
    {
        var medication = await db.Medications.AsNoTracking()
            .Include(m => m.Condition)
            .Include(m => m.MedicationSchedules.Where(s => !s.IsDeleted))
            .AsSplitQuery()
            .FirstOrDefaultAsync(m => m.Id == id);
        if (medication is null)
        {
            return OperationResult<MedicationDto>.Fail(NotFound);
        }

        return OperationResult<MedicationDto>.Ok(ToDto(medication, await RecentDosesAsync([id], today), today));
    }

    public async Task<OperationResult<MedicationDto>> CreateAsync(MedicationRequest request, DateOnly today)
    {
        var medication = new Medication { UserId = db.CurrentUserId!.Value };
        if (await ApplyAsync(medication, request) is { } error)
        {
            return OperationResult<MedicationDto>.Fail(error);
        }

        db.Medications.Add(medication);
        await db.SaveChangesAsync();
        return await GetAsync(medication.Id, today);
    }

    public async Task<OperationResult<MedicationDto>> UpdateAsync(int id, MedicationRequest request, DateOnly today)
    {
        var medication = await db.Medications.Include(m => m.MedicationSchedules.Where(s => !s.IsDeleted))
            .FirstOrDefaultAsync(m => m.Id == id);
        if (medication is null)
        {
            return OperationResult<MedicationDto>.Fail(NotFound);
        }

        if (medication.IsAsNeeded != request.IsAsNeeded
            && await db.MedicationDoses.AnyAsync(d => d.MedicationId == id))
        {
            return OperationResult<MedicationDto>.Fail(
                "Doses are already logged, so it can't switch between scheduled and as-needed — stop it and add it again.");
        }

        if (await ApplyAsync(medication, request) is { } error)
        {
            return OperationResult<MedicationDto>.Fail(error);
        }

        medication.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id, today);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var medication = await db.Medications.FindAsync(id);
        if (medication is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        medication.IsDeleted = true;
        medication.DeletedAt = now;
        await db.MedicationSchedules.Where(s => s.MedicationId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.IsDeleted, true).SetProperty(x => x.DeletedAt, now));
        await db.MedicationDoses.Where(d => d.MedicationId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.IsDeleted, true).SetProperty(x => x.DeletedAt, now));
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(MedicationLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(MedicationLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task<List<DoseDto>> GetDosesAsync(DateOnly day)
    {
        var slots = await db.MedicationSchedules.AsNoTracking()
            .Where(s => !s.Medication.IsDeleted && !s.Medication.IsAsNeeded && s.Medication.StartDate <= day
                && (s.Medication.EndDate == null || s.Medication.EndDate >= day))
            .Select(s => new
            {
                s.Id, s.MedicationId, s.TimeOfDay, s.ScheduleDays, s.Dose, s.Medication.Name, s.Medication.Strength,
                s.Medication.StartDate, s.Medication.EndDate,
            })
            .ToListAsync();
        var marked = await db.MedicationDoses.AsNoTracking()
            .Where(d => d.DoseDate == day && d.ScheduleId != null)
            .ToDictionaryAsync(d => d.ScheduleId!.Value);

        return slots
            .Where(s => MedicationRules.IsDue(new MedicationPlan(s.StartDate, s.EndDate, false), s.ScheduleDays, day))
            .OrderBy(s => s.TimeOfDay).ThenBy(s => s.Name)
            .Select(s => new DoseDto
            {
                MedicationId = s.MedicationId,
                MedicationName = s.Name,
                Strength = s.Strength,
                ScheduleId = s.Id,
                TimeOfDay = MedicationRules.FormatTime(s.TimeOfDay),
                Dose = s.Dose,
                Status = marked.TryGetValue(s.Id, out var dose) ? dose.Status : null,
                TakenAt = marked.TryGetValue(s.Id, out var taken) ? taken.TakenAt : null,
            })
            .ToList();
    }

    public async Task<OperationResult<List<DoseDto>>> SetDoseAsync(int scheduleId, DateOnly day, DoseRequest request)
    {
        var schedule = await db.MedicationSchedules.Include(s => s.Medication).FirstOrDefaultAsync(s => s.Id == scheduleId);
        if (schedule is null || schedule.Medication.IsDeleted)
        {
            return OperationResult<List<DoseDto>>.Fail("That dose wasn't found.");
        }

        var existing = await db.MedicationDoses.FirstOrDefaultAsync(d => d.ScheduleId == scheduleId && d.DoseDate == day);
        if (request.Status is null)
        {
            if (existing is not null)
            {
                existing.IsDeleted = true;
                existing.DeletedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
            }

            return OperationResult<List<DoseDto>>.Ok(await GetDosesAsync(day));
        }

        if (!HealthKinds.DoseStatuses.Contains(request.Status))
        {
            return OperationResult<List<DoseDto>>.Fail("Mark it taken or skipped.");
        }

        var plan = new MedicationPlan(schedule.Medication.StartDate, schedule.Medication.EndDate, schedule.Medication.IsAsNeeded);
        if (MedicationRules.CheckDose(plan, schedule.ScheduleDays, day, request.Today) is { } error)
        {
            return OperationResult<List<DoseDto>>.Fail(error);
        }

        // The moment is known only when it's marked on the day itself.
        var takenAt = request.Status == "Taken" && day == request.Today ? DateTime.UtcNow : (DateTime?)null;
        if (existing is null)
        {
            db.MedicationDoses.Add(new MedicationDose
            {
                UserId = schedule.UserId,
                MedicationId = schedule.MedicationId,
                ScheduleId = scheduleId,
                DoseDate = day,
                Status = request.Status,
                TakenAt = takenAt,
            });
        }
        else if (existing.Status != request.Status)
        {
            existing.Status = request.Status;
            existing.TakenAt = takenAt;
            existing.UpdatedAt = DateTime.UtcNow;
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            // Marked twice at once (two tabs): the other one's mark stands.
            db.ChangeTracker.Clear();
        }

        return OperationResult<List<DoseDto>>.Ok(await GetDosesAsync(day));
    }

    public async Task<OperationResult<MedicationDto>> LogAsNeededAsync(int medicationId, AsNeededDoseRequest request)
    {
        var medication = await db.Medications.FindAsync(medicationId);
        if (medication is null)
        {
            return OperationResult<MedicationDto>.Fail(NotFound);
        }

        var plan = new MedicationPlan(medication.StartDate, medication.EndDate, medication.IsAsNeeded);
        if (MedicationRules.CheckAsNeeded(plan, request.DoseDate, request.Today) is { } error)
        {
            return OperationResult<MedicationDto>.Fail(error);
        }

        db.MedicationDoses.Add(new MedicationDose
        {
            UserId = medication.UserId,
            MedicationId = medicationId,
            DoseDate = request.DoseDate,
            Status = "Taken",
            TakenAt = request.DoseDate == request.Today ? DateTime.UtcNow : null,
        });
        await db.SaveChangesAsync();
        return await GetAsync(medicationId, request.Today);
    }

    public async Task<OperationResult<MedicationDto>> RemoveAsNeededAsync(int medicationId, DateOnly day, DateOnly today)
    {
        var dose = await db.MedicationDoses
            .Where(d => d.MedicationId == medicationId && d.ScheduleId == null && d.DoseDate == day)
            .OrderByDescending(d => d.Id)
            .FirstOrDefaultAsync();
        if (dose is null)
        {
            return OperationResult<MedicationDto>.Fail("No dose was logged that day.");
        }

        dose.IsDeleted = true;
        dose.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(medicationId, today);
    }

    public async Task<DoseSummaryDto> GetSummaryAsync(DateOnly today)
    {
        var doses = await GetDosesAsync(today);
        return new DoseSummaryDto { Due = doses.Count, Done = doses.Count(d => d.Status is not null) };
    }

    private async Task<string?> ApplyAsync(Medication medication, MedicationRequest request)
    {
        if (MedicationRules.CheckMedication(request) is { } error)
        {
            return error;
        }

        if (request.ConditionId is { } conditionId && !await db.MedicalConditions.AnyAsync(c => c.Id == conditionId))
        {
            return "That medical history item wasn't found.";
        }

        if (request.PrescribedAtVisitId is { } visitId && !await db.DoctorVisits.AnyAsync(v => v.Id == visitId))
        {
            return "That visit wasn't found.";
        }

        medication.Name = request.Name.Trim();
        medication.Strength = HealthRules.Text(request.Strength);
        medication.StartDate = request.StartDate;
        medication.EndDate = request.EndDate;
        medication.IsAsNeeded = request.IsAsNeeded;
        medication.ConditionId = request.ConditionId;
        medication.PrescribedAtVisitId = request.PrescribedAtVisitId;
        medication.Notes = HealthRules.Text(request.Notes);

        var wanted = request.Schedules.ToDictionary(s => MedicationRules.ParseTime(s.TimeOfDay)!.Value);
        var now = DateTime.UtcNow;
        foreach (var schedule in medication.MedicationSchedules.Where(s => !s.IsDeleted).ToList())
        {
            if (wanted.Remove(schedule.TimeOfDay, out var keep))
            {
                schedule.ScheduleDays = keep.ScheduleDays;
                schedule.Dose = HealthRules.Text(keep.Dose);
                schedule.UpdatedAt = now;
            }
            else
            {
                schedule.IsDeleted = true;
                schedule.DeletedAt = now;
            }
        }

        foreach (var (time, added) in wanted)
        {
            medication.MedicationSchedules.Add(new MedicationSchedule
            {
                UserId = medication.UserId,
                TimeOfDay = time,
                ScheduleDays = added.ScheduleDays,
                Dose = HealthRules.Text(added.Dose),
            });
        }

        return null;
    }

    private async Task<List<MedicationDose>> RecentDosesAsync(List<int> medicationIds, DateOnly today)
    {
        var from = today.AddDays(-(MedicationRules.AdherenceDays - 1));
        return await db.MedicationDoses.AsNoTracking()
            .Where(d => medicationIds.Contains(d.MedicationId) && d.DoseDate >= from && d.DoseDate <= today)
            .ToListAsync();
    }

    private static MedicationDto ToDto(Medication m, List<MedicationDose> recentDoses, DateOnly today)
    {
        var plan = new MedicationPlan(m.StartDate, m.EndDate, m.IsAsNeeded);
        var schedules = m.MedicationSchedules.Where(s => !s.IsDeleted).OrderBy(s => s.TimeOfDay).ToList();
        var mine = recentDoses.Where(d => d.MedicationId == m.Id).ToList();
        var marked = mine.Where(d => d.ScheduleId != null)
            .ToDictionary(d => (d.ScheduleId!.Value, d.DoseDate), d => d.Status);
        var asNeeded = mine.Where(d => d.ScheduleId == null).ToList();
        return new MedicationDto
        {
            Id = m.Id,
            Name = m.Name,
            Strength = m.Strength,
            StartDate = m.StartDate,
            EndDate = m.EndDate,
            IsAsNeeded = m.IsAsNeeded,
            ConditionId = m.ConditionId,
            ConditionName = m.Condition is { IsDeleted: false } c ? c.Name : null,
            PrescribedAtVisitId = m.PrescribedAtVisitId,
            Notes = m.Notes,
            Schedules = schedules.Select(s => new MedicationScheduleDto
            {
                Id = s.Id,
                TimeOfDay = MedicationRules.FormatTime(s.TimeOfDay),
                ScheduleDays = s.ScheduleDays,
                Dose = s.Dose,
            }).ToList(),
            Adherence = m.IsAsNeeded
                ? null
                : MedicationRules.Adherence(plan, schedules.Select(s => new DoseSlot(s.Id, s.ScheduleDays)).ToList(), marked, today),
            TakenLast30Days = asNeeded.Count,
            LastTakenOn = asNeeded.Count == 0 ? null : asNeeded.Max(d => d.DoseDate),
        };
    }
}
