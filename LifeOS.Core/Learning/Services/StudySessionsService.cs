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
                BookId = s.BookId,
                BookTitle = s.Book != null ? s.Book.Title : null,
                StartedAt = s.StartedAt,
                Notes = s.Notes,
            })
            .ToListAsync();
        return OperationResult<List<StudySessionDto>>.Ok(sessions);
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
        if (topic is null && request.SkillId is null && request.CourseId is null && request.BookId is null)
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

        if (request.BookId is { } bookId && !await db.Books.AnyAsync(b => b.Id == bookId))
        {
            return "Book not found.";
        }

        session.StudiedOn = request.StudiedOn;
        session.Minutes = request.Minutes;
        session.Topic = topic;
        session.SkillId = request.SkillId;
        session.CourseId = request.CourseId;
        session.BookId = request.BookId;
        session.StartedAt = request.StartedAt?.ToUniversalTime();
        session.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        return null;
    }
}
