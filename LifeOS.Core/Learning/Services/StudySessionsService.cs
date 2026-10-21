using System.Data;
using Dapper;
using LifeOS.Core.Learning.DTOs;
using LifeOS.Core.Learning.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Learning.Services;

/// <summary>
/// The study log: time spent learning on a local day, about a topic and/or a skill, course or book — typed in or
/// logged by the study timer. Totals are summed from these, never stored.
/// </summary>
public class StudySessionsService(AppDbContext db) : IStudySessionsService
{
    private const string NotFound = "Study session not found.";

    /// <summary>A window long enough for a year's chart, short enough to stay quick.</summary>
    public const int MaxRangeDays = 400;

    public async Task<OperationResult<List<StudySessionDto>>> GetRangeAsync(DateOnly from, DateOnly to)
    {
        if (to < from)
        {
            return OperationResult<List<StudySessionDto>>.Fail("The end date must be on or after the start date.");
        }

        if (to.DayNumber - from.DayNumber + 1 > MaxRangeDays)
        {
            return OperationResult<List<StudySessionDto>>.Fail($"Ask for at most {MaxRangeDays} days at a time.");
        }

        var sessions = await db.StudySessions
            .Where(s => s.StudiedOn >= from && s.StudiedOn <= to)
            .OrderByDescending(s => s.StudiedOn).ThenByDescending(s => s.StartedAt ?? s.CreatedAt).ThenByDescending(s => s.Id)
            .Select(s => new StudySessionDto
            {
                Id = s.Id,
                StudiedOn = s.StudiedOn,
                Minutes = s.Minutes,
                Topic = s.Topic,
                SkillId = s.SkillId,
                SkillName = s.Skill != null ? s.Skill.Name : null,
                CourseId = s.CourseId,
                CourseTitle = s.Course != null ? s.Course.Title : null,
                MediaItemId = s.MediaItemId,
                MediaItemTitle = s.MediaItem != null ? s.MediaItem.Title : null,
                StartedAt = s.StartedAt,
                Notes = s.Notes,
            })
            .ToListAsync();
        return OperationResult<List<StudySessionDto>>.Ok(sessions);
    }

    public async Task<OperationResult<StudyAnalyticsDto>> GetAnalyticsAsync(DateOnly today, int weeks)
    {
        if (today == default)
        {
            return OperationResult<StudyAnalyticsDto>.Fail("Today's date is required.");
        }

        if (weeks is < StudyAnalytics.MinWeeks or > StudyAnalytics.MaxWeeks)
        {
            return OperationResult<StudyAnalyticsDto>.Fail($"Ask for {StudyAnalytics.MinWeeks} to {StudyAnalytics.MaxWeeks} weeks.");
        }

        var weekStarts = StudyAnalytics.WeekStarts(today, weeks);
        var parameters = new DynamicParameters();
        parameters.Add("UserId", db.CurrentUserId!.Value, DbType.Int32);
        parameters.Add("From", weekStarts[0].ToDateTime(TimeOnly.MinValue), DbType.Date);
        // The whole current week: a session can't be on a later day than the client's today anyway.
        parameters.Add("To", weekStarts[^1].AddDays(6).ToDateTime(TimeOnly.MinValue), DbType.Date);
        var rows = await db.Database.GetDbConnection().QueryAsync<WeekRow>(
            "learning.GetStudyBySubject", parameters, commandType: CommandType.StoredProcedure);

        return OperationResult<StudyAnalyticsDto>.Ok(StudyAnalytics.Build(weekStarts, rows.Select(r =>
            new StudyWeekRow(DateOnly.FromDateTime(r.WeekStart), r.SubjectKind, r.SubjectId, r.SubjectName, r.Minutes))));
    }

    // ADO.NET shapes as they come (DATE → DateTime).
    private sealed class WeekRow
    {
        public DateTime WeekStart { get; init; }
        public string SubjectKind { get; init; } = string.Empty;
        public int? SubjectId { get; init; }
        public string? SubjectName { get; init; }
        public int Minutes { get; init; }
    }

    public async Task<OperationResult<StudySessionDto>> CreateAsync(StudySessionRequest request)
    {
        var session = new StudySession { UserId = db.CurrentUserId!.Value };
        var error = await ApplyAsync(session, request);
        if (error is not null)
        {
            return OperationResult<StudySessionDto>.Fail(error);
        }

        db.StudySessions.Add(session);
        await db.SaveChangesAsync();
        return await GetAsync(session.Id);
    }

    public async Task<OperationResult<StudySessionDto>> UpdateAsync(int id, StudySessionRequest request)
    {
        var session = await db.StudySessions.FindAsync(id);
        if (session is null)
        {
            return OperationResult<StudySessionDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(session, request);
        if (error is not null)
        {
            return OperationResult<StudySessionDto>.Fail(error);
        }

        session.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var session = await db.StudySessions.FindAsync(id);
        if (session is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        session.IsDeleted = true;
        session.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<OperationResult<StudySessionDto>> GetAsync(int id)
    {
        var day = await db.StudySessions.Where(s => s.Id == id).Select(s => s.StudiedOn).FirstAsync();
        var list = await GetRangeAsync(day, day);
        return OperationResult<StudySessionDto>.Ok(list.Data!.First(s => s.Id == id));
    }

    private async Task<string?> ApplyAsync(StudySession session, StudySessionRequest request)
    {
        if (request.Today == default || request.StudiedOn == default)
        {
            return "The day studied and today's date are required.";
        }

        if (request.StudiedOn > request.Today)
        {
            return "A study session can't be on a day that hasn't come yet.";
        }

        if (request.Minutes is < 1 or > 1440)
        {
            return "A study session is 1 to 1440 minutes.";
        }

        var topic = string.IsNullOrWhiteSpace(request.Topic) ? null : request.Topic.Trim();
        if (topic is null && request.SkillId is null && request.CourseId is null && request.MediaItemId is null)
        {
            return "Say what you studied: a topic, or a skill, course or book.";
        }

        if (request.StartedAt is { } started && started.ToUniversalTime() > DateTime.UtcNow.AddMinutes(1))
        {
            return "A session can't start in the future.";
        }

        // Other users' items count as missing (the filters apply).
        if (request.SkillId is { } skillId && !await db.Skills.AnyAsync(s => s.Id == skillId))
        {
            return "Skill not found.";
        }

        if (request.CourseId is { } courseId && !await db.Courses.AnyAsync(c => c.Id == courseId))
        {
            return "Course not found.";
        }

        if (request.MediaItemId is { } mediaItemId && !await db.MediaItems.AnyAsync(m => m.Id == mediaItemId))
        {
            return "Item not found.";
        }

        session.StudiedOn = request.StudiedOn;
        session.Minutes = request.Minutes;
        session.Topic = topic;
        session.SkillId = request.SkillId;
        session.CourseId = request.CourseId;
        session.MediaItemId = request.MediaItemId;
        session.StartedAt = request.StartedAt?.ToUniversalTime();
        session.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        return null;
    }
}
