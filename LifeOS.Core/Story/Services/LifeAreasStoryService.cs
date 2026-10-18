using System.Data;
using Dapper;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.Services;
using LifeOS.Core.Story.DTOs;
using LifeOS.Core.Story.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Story.Services;

/// <summary>
/// Life areas in Story Mode: levels from what you've finished (story.GetLifeAreaStats via Dapper → LifeAreaLevels) and
/// the monthly self-rating (story.LifeAreaRatings, plain EF — one row per area per month, rewritten in place).
/// </summary>
public class LifeAreasStoryService(AppDbContext db) : ILifeAreasStoryService
{
    // Three years of months is plenty for a trend; more than that is a mistake in the request.
    private const int MaxRatingMonths = 36;

    public async Task<List<LifeAreaStatsDto>> GetStatsAsync()
    {
        var parameters = new DynamicParameters();
        parameters.Add("UserId", db.CurrentUserId!.Value, DbType.Int32);
        var rows = await db.Database.GetDbConnection().QueryAsync<StatsRow>(
            "story.GetLifeAreaStats", parameters, commandType: CommandType.StoredProcedure);

        return rows.Select(r =>
        {
            var level = LifeAreaLevels.For(LifeAreaLevels.Xp(r.GoalsCompleted, r.MilestonesCompleted, r.HabitDays, r.JournalEntries, r.StudyMinutes));
            return new LifeAreaStatsDto
            {
                LifeAreaId = r.LifeAreaId,
                LifeAreaName = r.LifeAreaName,
                GoalsCompleted = r.GoalsCompleted,
                MilestonesCompleted = r.MilestonesCompleted,
                HabitDays = r.HabitDays,
                JournalEntries = r.JournalEntries,
                StudyMinutes = r.StudyMinutes,
                LastActivityOn = r.LastActivityOn is { } last ? DateOnly.FromDateTime(last) : null,
                Xp = level.Xp,
                Level = level.Level,
                XpIntoLevel = level.XpIntoLevel,
                XpForNextLevel = level.XpForNextLevel,
            };
        }).ToList();
    }

    public async Task<OperationResult<List<LifeAreaRatingDto>>> GetRatingsAsync(DateOnly fromMonth, DateOnly toMonth)
    {
        if (fromMonth.Day != 1 || toMonth.Day != 1)
        {
            return OperationResult<List<LifeAreaRatingDto>>.Fail("Months are given by their first day (2026-10-01).");
        }

        if (toMonth < fromMonth)
        {
            return OperationResult<List<LifeAreaRatingDto>>.Fail("The last month must be on or after the first.");
        }

        if (MonthsBetween(fromMonth, toMonth) >= MaxRatingMonths)
        {
            return OperationResult<List<LifeAreaRatingDto>>.Fail($"Ask for at most {MaxRatingMonths} months at a time.");
        }

        var ratings = await db.LifeAreaRatings
            .Where(r => r.MonthStart >= fromMonth && r.MonthStart <= toMonth)
            .OrderBy(r => r.MonthStart)
            .Select(r => new LifeAreaRatingDto
            {
                LifeAreaId = r.LifeAreaId,
                Month = r.MonthStart,
                Rating = r.Rating,
                Note = r.Note,
            })
            .ToListAsync();
        return OperationResult<List<LifeAreaRatingDto>>.Ok(ratings);
    }

    public async Task<OperationResult<List<LifeAreaRatingDto>>> SaveRatingsAsync(DateOnly month, LifeAreaRatingsRequest request)
    {
        if (month.Day != 1)
        {
            return OperationResult<List<LifeAreaRatingDto>>.Fail("Months are given by their first day (2026-10-01).");
        }

        if (month > ChapterRules.MonthStart(request.Today!.Value))
        {
            return OperationResult<List<LifeAreaRatingDto>>.Fail("That month hasn't begun yet.");
        }

        if (request.Ratings.Select(r => r.LifeAreaId).Distinct().Count() != request.Ratings.Count)
        {
            return OperationResult<List<LifeAreaRatingDto>>.Fail("Each life area can be rated once per month.");
        }

        var areaIds = await db.LifeAreas.Select(a => a.Id).ToListAsync();
        if (request.Ratings.Any(r => !areaIds.Contains(r.LifeAreaId)))
        {
            return OperationResult<List<LifeAreaRatingDto>>.Fail("Unknown life area.");
        }

        var existing = await db.LifeAreaRatings.Where(r => r.MonthStart == month).ToDictionaryAsync(r => r.LifeAreaId);
        var now = DateTime.UtcNow;
        foreach (var item in request.Ratings)
        {
            existing.TryGetValue(item.LifeAreaId, out var row);
            var note = string.IsNullOrWhiteSpace(item.Note) ? null : item.Note.Trim();

            if (item.Rating is not { } rating)
            {
                // Cleared: the month goes back to unrated for this area (a note alone isn't a rating).
                if (row is not null)
                {
                    row.IsDeleted = true;
                    row.DeletedAt = now;
                }

                continue;
            }

            if (row is null)
            {
                db.LifeAreaRatings.Add(new LifeAreaRating
                {
                    UserId = db.CurrentUserId!.Value,
                    LifeAreaId = item.LifeAreaId,
                    MonthStart = month,
                    Rating = rating,
                    Note = note,
                });
            }
            else if (row.Rating != rating || row.Note != note)
            {
                // Rewritten in place: one live rating per area per month (UX_LifeAreaRatings_User_Area_Month).
                row.Rating = rating;
                row.Note = note;
                row.UpdatedAt = now;
            }
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            // The same month saved twice at once (a double-click, two tabs).
            return OperationResult<List<LifeAreaRatingDto>>.Fail("Those ratings were saved somewhere else at the same moment. Reload and try again.");
        }

        return await GetRatingsAsync(month, month);
    }

    private static int MonthsBetween(DateOnly from, DateOnly to) => (to.Year - from.Year) * 12 + to.Month - from.Month;

    // ADO.NET shapes as they come (DATE → DateTime).
    private sealed class StatsRow
    {
        public int LifeAreaId { get; init; }
        public string LifeAreaName { get; init; } = string.Empty;
        public int GoalsCompleted { get; init; }
        public int MilestonesCompleted { get; init; }
        public int HabitDays { get; init; }
        public int JournalEntries { get; init; }
        public int StudyMinutes { get; init; }
        public DateTime? LastActivityOn { get; init; }
    }
}
