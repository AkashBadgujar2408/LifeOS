using System.Data;
using Dapper;
using LifeOS.Core.Calendar.Services;
using LifeOS.Core.Dashboard.DTOs;
using LifeOS.Core.Dashboard.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.Services;
using LifeOS.Core.Story.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Dashboard.Services;

/// <summary>
/// Personal KPI tiles: which ones are stored per user (dashboard.KpiTiles), the numbers never are — they come from
/// dashboard.GetKpiFacts (three result sets, read in order) plus KpiFigures for habit consistency.
/// </summary>
public class KpisService(AppDbContext db) : IKpisService
{
    public async Task<OperationResult<KpisDto>> GetAsync(DateOnly today, string? timeZoneId)
    {
        if (!LifeStoryService.TryFindZone(timeZoneId, out var zone))
        {
            return OperationResult<KpisDto>.Fail(LifeStoryService.UnknownZone(timeZoneId));
        }

        var chosen = await db.KpiTiles
            .OrderBy(t => t.SortOrder).ThenBy(t => t.Id)
            .Select(t => t.KpiKey)
            .ToListAsync();
        if (chosen.Count == 0)
        {
            return OperationResult<KpisDto>.Ok(new KpisDto { Available = [.. KpiFigures.All] });
        }

        var windows = KpiWindows.For(today);
        DateTime Utc(DateOnly day) => EventRecurrence.LocalToUtc(day.ToDateTime(TimeOnly.MinValue), zone);

        var parameters = new DynamicParameters();
        parameters.Add("UserId", db.CurrentUserId!.Value, DbType.Int32);
        parameters.Add("Today", today.ToDateTime(TimeOnly.MinValue), DbType.Date);
        parameters.Add("Last30Start", windows.Last30Start.ToDateTime(TimeOnly.MinValue), DbType.Date);
        parameters.Add("Prev30Start", windows.Prev30Start.ToDateTime(TimeOnly.MinValue), DbType.Date);
        parameters.Add("WeekStartUtc", Utc(windows.WeekStart), DbType.DateTime2);
        parameters.Add("LastWeekStartUtc", Utc(windows.LastWeekStart), DbType.DateTime2);
        parameters.Add("Last30StartUtc", Utc(windows.Last30Start), DbType.DateTime2);
        parameters.Add("Prev30StartUtc", Utc(windows.Prev30Start), DbType.DateTime2);
        parameters.Add("YearStartUtc", Utc(windows.YearStart), DbType.DateTime2);
        parameters.Add("TomorrowStartUtc", Utc(today.AddDays(1)), DbType.DateTime2);

        await using var reader = await db.Database.GetDbConnection().QueryMultipleAsync(
            "dashboard.GetKpiFacts", parameters, commandType: CommandType.StoredProcedure);
        // Read in exactly the order the procedure returns them.
        var facts = await reader.ReadSingleAsync<FactsRow>();
        var habits = (await reader.ReadAsync<HabitRow>())
            .Select(h => new KpiHabit(h.Id, h.ScheduleDays, DateOnly.FromDateTime(h.StartDate)))
            .ToList();
        var metDays = (await reader.ReadAsync<EntryRow>())
            .GroupBy(e => e.HabitId)
            .ToDictionary(g => g.Key, g => g.Select(e => DateOnly.FromDateTime(e.EntryDate)).ToHashSet());

        (int? Value, int? Previous) Figure(string key) => key switch
        {
            KpiKeys.TasksDoneWeek => (facts.TasksDoneThisWeek, facts.TasksDoneLastWeek),
            KpiKeys.FocusWeek => (facts.FocusMinutesThisWeek, facts.FocusMinutesLastWeek),
            KpiKeys.HabitConsistency30 => (
                KpiFigures.HabitConsistency(habits, metDays, windows.Last30Start, today, today),
                KpiFigures.HabitConsistency(habits, metDays, windows.Prev30Start, windows.Last30Start.AddDays(-1), today)),
            KpiKeys.JournalDays30 => (facts.JournalDaysLast30, facts.JournalDaysPrev30),
            KpiKeys.ObjectivesDone30 => (facts.ObjectivesDoneLast30, facts.ObjectivesDonePrev30),
            KpiKeys.GoalsPassedYear => (facts.GoalsPassedThisYear, null),
            KpiKeys.GoalsActive => (facts.GoalsActive, null),
            _ => (null, null),
        };

        var tiles = chosen
            .Select(key => KpiFigures.All.FirstOrDefault(k => k.Key == key))
            .OfType<KpiDefinition>()
            .Select(definition =>
            {
                var (value, previous) = Figure(definition.Key);
                return new KpiTileDto
                {
                    Key = definition.Key,
                    Label = definition.Label,
                    Module = definition.Module,
                    Unit = definition.Unit,
                    Value = value,
                    Previous = previous,
                    ComparedWith = definition.ComparedWith,
                };
            })
            .ToList();

        return OperationResult<KpisDto>.Ok(new KpisDto { Available = [.. KpiFigures.All], Tiles = tiles });
    }

    public async Task<OperationResult<List<string>>> SaveAsync(SaveKpisRequest request)
    {
        var keys = request.Keys.Select(k => k.Trim()).ToList();
        if (keys.FirstOrDefault(k => !KpiFigures.IsKnown(k)) is { } unknown)
        {
            return OperationResult<List<string>>.Fail($"Unknown figure '{unknown}'.");
        }

        if (keys.Distinct(StringComparer.Ordinal).Count() != keys.Count)
        {
            return OperationResult<List<string>>.Fail("Each figure can be picked once.");
        }

        if (keys.Count > KpiFigures.MaxTiles)
        {
            return OperationResult<List<string>>.Fail($"Pick at most {KpiFigures.MaxTiles} figures.");
        }

        var userId = db.CurrentUserId!.Value;
        var now = DateTime.UtcNow;
        var current = await db.KpiTiles.ToListAsync();
        foreach (var tile in current.Where(t => !keys.Contains(t.KpiKey)))
        {
            tile.IsDeleted = true;
            tile.DeletedAt = now;
        }

        for (var i = 0; i < keys.Count; i++)
        {
            if (current.FirstOrDefault(t => t.KpiKey == keys[i]) is { } kept)
            {
                if (kept.SortOrder != i)
                {
                    kept.SortOrder = i;
                    kept.UpdatedAt = now;
                }
            }
            else
            {
                db.KpiTiles.Add(new KpiTile { UserId = userId, KpiKey = keys[i], SortOrder = i });
            }
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<List<string>>.Fail("Your figures were changed somewhere else at the same time. Reload and try again.");
        }

        return OperationResult<List<string>>.Ok(keys);
    }

    // ADO.NET shapes as they come (DATE → DateTime); converted above.
    private sealed class FactsRow
    {
        public int TasksDoneThisWeek { get; init; }
        public int TasksDoneLastWeek { get; init; }
        public int FocusMinutesThisWeek { get; init; }
        public int FocusMinutesLastWeek { get; init; }
        public int JournalDaysLast30 { get; init; }
        public int JournalDaysPrev30 { get; init; }
        public int ObjectivesDoneLast30 { get; init; }
        public int ObjectivesDonePrev30 { get; init; }
        public int GoalsPassedThisYear { get; init; }
        public int GoalsActive { get; init; }
    }

    private sealed class HabitRow
    {
        public int Id { get; init; }
        public byte ScheduleDays { get; init; }
        public DateTime StartDate { get; init; }
    }

    private sealed class EntryRow
    {
        public int HabitId { get; init; }
        public DateTime EntryDate { get; init; }
    }
}
