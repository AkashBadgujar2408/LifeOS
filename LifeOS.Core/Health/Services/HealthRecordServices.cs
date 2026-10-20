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
/// Lab results. A test's history is every result with the same name (any case, trimmed); the flag against the range
/// is computed on read (<see cref="HealthRecordRules.Flag"/>). Reports are linked Documents, like visits'.
/// </summary>
public class LabResultsService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService)
    : ILabResultsService
{
    private const string NotFound = "Result not found.";

    public async Task<List<LabTestDto>> GetTestsAsync() =>
        (await db.LabResults.AsNoTracking().ToListAsync())
            .GroupBy(r => HealthRecordRules.TestKey(r.TestName))
            .Select(g =>
            {
                var results = g.OrderByDescending(r => r.TakenOn).ThenByDescending(r => r.Id).Select(ToDto).ToList();
                return new LabTestDto
                {
                    // The spelling used most (ties: the latest), so one odd entry doesn't rename the test.
                    TestName = results.GroupBy(r => r.TestName).OrderByDescending(n => n.Count()).First().Key,
                    Unit = results.Select(r => r.Unit).FirstOrDefault(u => u is not null),
                    Results = results,
                    LatestOutOfRange = results[0].Flag is LabFlags.Low or LabFlags.High,
                };
            })
            // Out of range first, then the most recently tested.
            .OrderByDescending(t => t.LatestOutOfRange).ThenByDescending(t => t.Results[0].TakenOn).ThenBy(t => t.TestName)
            .ToList();

    public async Task<OperationResult<LabResultDto>> GetAsync(int id)
    {
        var result = await db.LabResults.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id);
        return result is null ? OperationResult<LabResultDto>.Fail(NotFound) : OperationResult<LabResultDto>.Ok(ToDto(result));
    }

    public async Task<OperationResult<LabResultDto>> CreateAsync(LabResultRequest request)
    {
        var result = new LabResult { UserId = db.CurrentUserId!.Value };
        if (await ApplyAsync(result, request) is { } error)
        {
            return OperationResult<LabResultDto>.Fail(error);
        }

        db.LabResults.Add(result);
        await db.SaveChangesAsync();
        return OperationResult<LabResultDto>.Ok(ToDto(result));
    }

    public async Task<OperationResult<LabResultDto>> UpdateAsync(int id, LabResultRequest request)
    {
        var result = await db.LabResults.FindAsync(id);
        if (result is null)
        {
            return OperationResult<LabResultDto>.Fail(NotFound);
        }

        if (await ApplyAsync(result, request) is { } error)
        {
            return OperationResult<LabResultDto>.Fail(error);
        }

        result.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<LabResultDto>.Ok(ToDto(result));
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var result = await db.LabResults.FindAsync(id);
        if (result is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        result.IsDeleted = true;
        result.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(LabResultLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(LabResultLinkableProvider.Type, id);
        return OperationResult<bool>.Ok(true);
    }

    private async Task<string?> ApplyAsync(LabResult result, LabResultRequest request)
    {
        if (HealthRecordRules.CheckLab(request) is { } error)
        {
            return error;
        }

        if (request.VisitId is { } visitId && !await db.DoctorVisits.AnyAsync(v => v.Id == visitId))
        {
            return "That visit wasn't found.";
        }

        result.TestName = request.TestName.Trim();
        result.TakenOn = request.TakenOn;
        result.Value = request.Value;
        result.ValueText = HealthRules.Text(request.ValueText);
        result.Unit = HealthRules.Text(request.Unit);
        result.RangeLow = request.RangeLow;
        result.RangeHigh = request.RangeHigh;
        result.Laboratory = HealthRules.Text(request.Laboratory);
        result.VisitId = request.VisitId;
        result.Notes = HealthRules.Text(request.Notes);
        return null;
    }

    private static LabResultDto ToDto(LabResult r) => new()
    {
        Id = r.Id,
        TestName = r.TestName,
        TakenOn = r.TakenOn,
        Value = r.Value,
        ValueText = r.ValueText,
        Unit = r.Unit,
        RangeLow = r.RangeLow,
        RangeHigh = r.RangeHigh,
        Laboratory = r.Laboratory,
        VisitId = r.VisitId,
        Notes = r.Notes,
        Flag = HealthRecordRules.Flag(r.Value, r.RangeLow, r.RangeHigh),
    };
}

/// <summary>
/// Stress and energy, one check-in per day (rewritten in place; all blank soft-deletes it), read beside the journal's
/// mood for the same days. Averages are over the days that have a value.
/// </summary>
public class WellnessService(AppDbContext db) : IWellnessService
{
    private const int LongestRangeDays = 400;

    public async Task<WellnessDto> GetAsync(DateOnly from, DateOnly to, DateOnly today)
    {
        if (to < from || to.DayNumber - from.DayNumber >= LongestRangeDays)
        {
            return new WellnessDto();
        }

        var checkIns = await db.WellnessCheckIns.AsNoTracking()
            .Where(c => (c.CheckInOn >= from && c.CheckInOn <= to) || c.CheckInOn == today)
            .ToListAsync();
        var moods = await db.JournalEntries.AsNoTracking()
            .Where(e => e.EntryDate >= from && e.EntryDate <= to && e.Mood != null)
            .Select(e => new { e.EntryDate, e.Mood })
            .ToDictionaryAsync(e => e.EntryDate, e => e.Mood);
        var byDay = checkIns.ToDictionary(c => c.CheckInOn);

        var days = new List<WellnessDayDto>();
        for (var day = from; day <= to; day = day.AddDays(1))
        {
            byDay.TryGetValue(day, out var checkIn);
            days.Add(new WellnessDayDto
            {
                Day = day,
                Mood = moods.GetValueOrDefault(day),
                StressLevel = checkIn?.StressLevel,
                EnergyLevel = checkIn?.EnergyLevel,
            });
        }

        return new WellnessDto
        {
            Days = days,
            Today = byDay.TryGetValue(today, out var todays) ? ToDto(todays) : null,
            AverageMood = Average(days.Select(d => d.Mood)),
            AverageStress = Average(days.Select(d => d.StressLevel)),
            AverageEnergy = Average(days.Select(d => d.EnergyLevel)),
        };
    }

    public async Task<OperationResult<WellnessCheckInDto?>> SaveAsync(DateOnly day, WellnessCheckInRequest request)
    {
        if (HealthRecordRules.CheckCheckIn(request, day) is { } error)
        {
            return OperationResult<WellnessCheckInDto?>.Fail(error);
        }

        var checkIn = await db.WellnessCheckIns.FirstOrDefaultAsync(c => c.CheckInOn == day);
        if (HealthRecordRules.IsBlank(request))
        {
            if (checkIn is not null)
            {
                checkIn.IsDeleted = true;
                checkIn.DeletedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
            }

            return OperationResult<WellnessCheckInDto?>.Ok(null);
        }

        if (checkIn is null)
        {
            checkIn = new WellnessCheckIn { UserId = db.CurrentUserId!.Value, CheckInOn = day };
            db.WellnessCheckIns.Add(checkIn);
        }
        else
        {
            checkIn.UpdatedAt = DateTime.UtcNow;
        }

        checkIn.StressLevel = request.StressLevel;
        checkIn.EnergyLevel = request.EnergyLevel;
        checkIn.Notes = HealthRules.Text(request.Notes);
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<WellnessCheckInDto?>.Fail("Today's check-in was just saved from somewhere else — reload and try again.");
        }

        return OperationResult<WellnessCheckInDto?>.Ok(ToDto(checkIn));
    }

    private static decimal? Average(IEnumerable<byte?> values)
    {
        var known = values.Where(v => v is not null).Select(v => (int)v!.Value).ToList();
        return known.Count == 0 ? null : Math.Round((decimal)known.Average(), 1, MidpointRounding.AwayFromZero);
    }

    private static WellnessCheckInDto ToDto(WellnessCheckIn c) => new()
    {
        Day = c.CheckInOn,
        StressLevel = c.StressLevel,
        EnergyLevel = c.EnergyLevel,
        Notes = c.Notes,
    };
}

/// <summary>
/// Health targets on goals ("Weigh 75 kg"). The target is kept in the health schema (behind the vault), one per
/// goal, rewritten in place (EF maps it one-to-one); progress follows the latest measurement of the kind.
/// </summary>
public class GoalTargetsService(AppDbContext db) : IGoalTargetsService
{
    public async Task<List<GoalTargetDto>> GetAllAsync()
    {
        var targets = await db.GoalTargets.AsNoTracking().Include(t => t.Goal).Where(t => !t.Goal.IsDeleted).ToListAsync();
        var latest = await LatestAsync(targets.Select(t => t.Kind).Distinct().ToList());
        return targets.Select(t => ToDto(t, latest)).OrderBy(t => t.GoalTitle).ToList();
    }

    public async Task<OperationResult<GoalTargetDto?>> GetAsync(int goalId)
    {
        if (!await db.Goals.AnyAsync(g => g.Id == goalId))
        {
            return OperationResult<GoalTargetDto?>.Fail("Goal not found.");
        }

        var target = await db.GoalTargets.AsNoTracking().Include(t => t.Goal).FirstOrDefaultAsync(t => t.GoalId == goalId);
        return OperationResult<GoalTargetDto?>.Ok(target is null ? null : ToDto(target, await LatestAsync([target.Kind])));
    }

    public async Task<OperationResult<GoalTargetDto?>> SaveAsync(int goalId, GoalTargetRequest request)
    {
        var goal = await db.Goals.FindAsync(goalId);
        if (goal is null)
        {
            return OperationResult<GoalTargetDto?>.Fail("Goal not found.");
        }

        // One kind of target per goal (Session 71d).
        if (goal.MeasureTarget is not null || goal.TargetAmount is not null)
        {
            return OperationResult<GoalTargetDto?>.Fail(
                "This goal is already measured by a number or an amount — change that in the goal's editor first.");
        }

        var latest = await LatestAsync([request.Kind]);
        var start = request.StartValue ?? (latest.TryGetValue(request.Kind, out var reading) ? reading.Value : null);
        if (start is null)
        {
            return OperationResult<GoalTargetDto?>.Fail("Nothing measured yet — give the starting value.");
        }

        if (HealthRecordRules.CheckGoalTarget(request.Kind, start.Value, request.TargetValue) is { } error)
        {
            return OperationResult<GoalTargetDto?>.Fail(error);
        }

        var target = await db.GoalTargets.FirstOrDefaultAsync(t => t.GoalId == goalId);
        if (target is null)
        {
            target = new GoalTarget { UserId = goal.UserId, GoalId = goalId };
            db.GoalTargets.Add(target);
        }
        else
        {
            target.UpdatedAt = DateTime.UtcNow;
        }

        target.Kind = request.Kind;
        target.StartValue = Math.Round(start.Value, 2, MidpointRounding.AwayFromZero);
        target.TargetValue = Math.Round(request.TargetValue, 2, MidpointRounding.AwayFromZero);
        await db.SaveChangesAsync();
        return await GetAsync(goalId);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int goalId)
    {
        var target = await db.GoalTargets.FirstOrDefaultAsync(t => t.GoalId == goalId);
        if (target is null)
        {
            return OperationResult<bool>.Fail("This goal has no health target.");
        }

        target.IsDeleted = true;
        target.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    /// <summary>The latest reading of each kind asked for.</summary>
    private async Task<Dictionary<string, (decimal Value, DateOnly On)>> LatestAsync(List<string> kinds) =>
        (await db.BodyMeasurements.AsNoTracking().Where(m => kinds.Contains(m.Kind))
            .Select(m => new { m.Kind, m.Value, m.MeasuredOn, m.Id }).ToListAsync())
        .GroupBy(m => m.Kind)
        .ToDictionary(g => g.Key, g =>
        {
            var last = g.OrderByDescending(m => m.MeasuredOn).ThenByDescending(m => m.Id).First();
            return (last.Value, last.MeasuredOn);
        });

    private static GoalTargetDto ToDto(GoalTarget t, Dictionary<string, (decimal Value, DateOnly On)> latest)
    {
        var reading = latest.TryGetValue(t.Kind, out var r) ? r : ((decimal Value, DateOnly On)?)null;
        return new GoalTargetDto
        {
            GoalId = t.GoalId,
            GoalTitle = t.Goal.Title,
            Kind = t.Kind,
            Unit = HealthKinds.MeasurementUnits[t.Kind],
            StartValue = t.StartValue,
            TargetValue = t.TargetValue,
            LatestValue = reading?.Value,
            LatestOn = reading?.On,
            Percent = HealthRecordRules.GoalPercent(t.StartValue, t.TargetValue, reading?.Value),
        };
    }
}
