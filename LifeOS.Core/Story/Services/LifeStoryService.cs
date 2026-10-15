using System.Data;
using Dapper;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Story.DTOs;
using LifeOS.Core.Story.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Story.Services;

/// <summary>
/// The Life Story: beats from story.GetLifeStory (Dapper — a six-way UNION across goals, habits, journal and story),
/// each placed on the user's local day using their real timezone (IANA id from the browser; exact across DST, unlike
/// an offset), then filed into chapters by LifeStoryBuilder.
/// </summary>
public class LifeStoryService(AppDbContext db, IChaptersService chaptersService) : ILifeStoryService
{
    public async Task<OperationResult<LifeStoryDto>> GetAsync(string? timeZoneId)
    {
        TimeZoneInfo zone;
        try
        {
            zone = string.IsNullOrWhiteSpace(timeZoneId) ? TimeZoneInfo.Utc : TimeZoneInfo.FindSystemTimeZoneById(timeZoneId);
        }
        catch (Exception ex) when (ex is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            return OperationResult<LifeStoryDto>.Fail($"Unknown time zone '{timeZoneId}'.");
        }

        var parameters = new DynamicParameters();
        parameters.Add("UserId", db.CurrentUserId!.Value, DbType.Int32);
        var rows = await db.Database.GetDbConnection().QueryAsync<BeatRow>(
            "story.GetLifeStory", parameters, commandType: CommandType.StoredProcedure);

        var beats = rows.Select(r => ToBeat(r, zone)).ToList();
        var chapters = await chaptersService.ListAsync();

        return OperationResult<LifeStoryDto>.Ok(new LifeStoryDto
        {
            Sections = LifeStoryBuilder.Build(chapters, beats),
            MissionsPassed = beats.Count(b => b.Kind == StoryBeatKinds.MissionPassed),
            MilestonesDone = beats.Count(b => b.Kind == StoryBeatKinds.MilestoneDone),
            ChapterCount = chapters.Count,
        });
    }

    private static StoryBeatDto ToBeat(BeatRow row, TimeZoneInfo zone)
    {
        DateTime? at = row.OccurredAt is { } moment ? DateTime.SpecifyKind(moment, DateTimeKind.Utc) : null;
        var day = row.OccurredOn is { } date
            ? DateOnly.FromDateTime(date)
            : DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(at!.Value, zone));

        return new StoryBeatDto
        {
            Kind = row.Kind,
            Day = day,
            At = at,
            Title = row.Title,
            Detail = row.Detail,
            Note = row.Note,
            Advice = row.Advice,
            MissionKind = row.GoalType is null ? null : MissionKinds.Of(row.GoalType),
            LifeAreaName = row.LifeAreaName,
            Mood = row.Mood,
            FromDate = row.FromDate is { } from ? DateOnly.FromDateTime(from) : null,
            ToDate = row.ToDate is { } to ? DateOnly.FromDateTime(to) : null,
            EntityType = row.EntityType,
            EntityId = row.EntityId,
            ParentTitle = row.ParentTitle,
        };
    }

    // ADO.NET shapes as they come: DATE → DateTime, DATETIME2 → unspecified kind (converted above).
    private sealed class BeatRow
    {
        public string Kind { get; init; } = string.Empty;
        public DateTime? OccurredOn { get; init; }
        public DateTime? OccurredAt { get; init; }
        public string? Title { get; init; }
        public string? Detail { get; init; }
        public string? Note { get; init; }
        public string? Advice { get; init; }
        public string? GoalType { get; init; }
        public string? LifeAreaName { get; init; }
        public byte? Mood { get; init; }
        public DateTime? FromDate { get; init; }
        public DateTime? ToDate { get; init; }
        public string? EntityType { get; init; }
        public int? EntityId { get; init; }
        public string? ParentTitle { get; init; }
    }
}
