using System.Data;
using Dapper;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Story.DTOs;
using LifeOS.Core.Story.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Story.Services;

/// <summary>
/// Achievements: the facts come from story.GetAchievementFacts (nine result sets, one round trip, read in order with
/// Dapper QueryMultiple), UTC moments go onto the user's local days with their timezone, and the pure
/// Achievements.Evaluate decides what's unlocked. Nothing is stored.
/// </summary>
public class AchievementsService(AppDbContext db) : IAchievementsService
{
    public async Task<OperationResult<List<AchievementDto>>> GetAsync(string? timeZoneId)
    {
        if (!LifeStoryService.TryFindZone(timeZoneId, out var zone))
        {
            return OperationResult<List<AchievementDto>>.Fail(LifeStoryService.UnknownZone(timeZoneId));
        }

        var achievements = await EvaluateAsync(zone);
        return OperationResult<List<AchievementDto>>.Ok(achievements.Select(a => new AchievementDto
        {
            Key = a.Key,
            Title = a.Title,
            Description = a.Description,
            Icon = a.Icon,
            Progress = a.Progress,
            Target = a.Target,
            UnlockedOn = a.UnlockedOn,
        }).ToList());
    }

    public async Task<IReadOnlyList<Achievement>> EvaluateAsync(TimeZoneInfo zone)
    {
        DateOnly Local(DateTime utc) =>
            DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), zone));

        var parameters = new DynamicParameters();
        parameters.Add("UserId", db.CurrentUserId!.Value, DbType.Int32);
        await using var reader = await db.Database.GetDbConnection().QueryMultipleAsync(
            "story.GetAchievementFacts", parameters, commandType: CommandType.StoredProcedure);

        // Read in exactly the order the procedure returns them.
        var goals = (await reader.ReadAsync<GoalRow>()).ToList();
        var objectives = (await reader.ReadAsync<MomentRow>()).ToList();
        var habits = (await reader.ReadAsync<HabitRow>()).ToList();
        var habitDays = (await reader.ReadAsync<HabitDayRow>()).ToList();
        var journal = (await reader.ReadAsync<DayRow>()).ToList();
        var chapters = (await reader.ReadAsync<ChapterRow>()).ToList();
        var debriefs = (await reader.ReadAsync<DateTime>()).ToList();
        var ratings = (await reader.ReadAsync<RatingRow>()).ToList();
        var lifeAreaCount = await reader.ReadSingleAsync<int>();
        var challenges = (await reader.ReadAsync<ChallengeRow>()).ToList();
        var slips = (await reader.ReadAsync<HabitDayRow>()).ToLookup(s => s.HabitId, s => DateOnly.FromDateTime(s.EntryDate));

        var daysByHabit = habitDays.ToLookup(d => d.HabitId, d => DateOnly.FromDateTime(d.EntryDate));
        var areaByHabit = habitDays.GroupBy(d => d.HabitId).ToDictionary(g => g.Key, g => g.First().LifeAreaId);

        var facts = new AchievementFacts(
            Local(DateTime.UtcNow),
            lifeAreaCount,
            goals.Select(g => new PassedGoalFact(g.GoalType, g.LifeAreaId, Local(g.CompletedAt))).ToList(),
            objectives.Select(o => new AreaDay(o.LifeAreaId, Local(o.CompletedAt))).ToList(),
            habits.Select(h => new HabitFact(
                h.Id, h.ScheduleDays, DateOnly.FromDateTime(h.StartDate), areaByHabit.GetValueOrDefault(h.Id), daysByHabit[h.Id].ToList()))
                .ToList(),
            journal.Select(j => new AreaDay(j.LifeAreaId, DateOnly.FromDateTime(j.EntryDate))).ToList(),
            chapters.Select(c => new ChapterFact(
                DateOnly.FromDateTime(c.StartDate), c.EndDate is { } end ? DateOnly.FromDateTime(end) : null, Local(c.CreatedAt)))
                .ToList(),
            debriefs.Select(Local).ToList(),
            ratings.Select(r => new RatingFact(r.LifeAreaId, DateOnly.FromDateTime(r.MonthStart), Local(r.CreatedAt))).ToList(),
            challenges.Select(c => new ChallengeFact(c.HabitId, c.Days, DateOnly.FromDateTime(c.StartDate), c.Kind == "Avoid",
                c.ScheduleDays, DateOnly.FromDateTime(c.HabitStartDate), slips[c.HabitId].ToList())).ToList());

        return Achievements.Evaluate(facts);
    }

    // ADO.NET shapes as they come: DATE → DateTime, DATETIME2 → unspecified kind (treated as UTC above).
    private sealed class GoalRow
    {
        public string GoalType { get; init; } = string.Empty;
        public int LifeAreaId { get; init; }
        public DateTime CompletedAt { get; init; }
    }

    private sealed class MomentRow
    {
        public int? LifeAreaId { get; init; }
        public DateTime CompletedAt { get; init; }
    }

    private sealed class HabitRow
    {
        public int Id { get; init; }
        public byte ScheduleDays { get; init; }
        public DateTime StartDate { get; init; }
    }

    private sealed class HabitDayRow
    {
        public int HabitId { get; init; }
        public int? LifeAreaId { get; init; }
        public DateTime EntryDate { get; init; }
    }

    private sealed class DayRow
    {
        public int? LifeAreaId { get; init; }
        public DateTime EntryDate { get; init; }
    }

    private sealed class ChapterRow
    {
        public DateTime StartDate { get; init; }
        public DateTime? EndDate { get; init; }
        public DateTime CreatedAt { get; init; }
    }

    private sealed class ChallengeRow
    {
        public int HabitId { get; init; }
        public int Days { get; init; }
        public DateTime StartDate { get; init; }
        public string Kind { get; init; } = string.Empty;
        public byte ScheduleDays { get; init; }
        public DateTime HabitStartDate { get; init; }
    }

    private sealed class RatingRow
    {
        public int LifeAreaId { get; init; }
        public DateTime MonthStart { get; init; }
        public DateTime CreatedAt { get; init; }
    }
}
