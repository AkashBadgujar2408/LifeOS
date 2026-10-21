using System.Linq.Expressions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Leisure.DTOs;
using LifeOS.Core.Leisure.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Leisure.Services;

/// <summary>
/// Hobbies and the time given to them (Session 78a). A hobby can name the habit it's practised through; logging a
/// session never ticks that habit (they stay apart — a habit day and an hour of practice are different facts).
/// </summary>
public class HobbiesService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService)
    : IHobbiesService
{
    private const string NotFound = "Hobby not found.";
    private const string SessionNotFound = "Practice session not found.";
    private const string DuplicateName = "You already have a hobby with this name.";

    public async Task<List<HobbyDto>> GetAllAsync() =>
        await db.Hobbies
            .OrderBy(h => h.Status != HobbyStatuses.Active)
            .ThenBy(h => h.Name)
            .Select(ToDto)
            .ToListAsync();

    public async Task<List<HobbyMonthDto>> TimeByMonthAsync(DateOnly today, int months)
    {
        var last = LeisureFigures.MonthStart(today);
        var first = last.AddMonths(-(Math.Clamp(months, 1, 24) - 1));
        var sessions = await db.HobbySessions
            .Where(s => s.PracticedOn >= first && s.PracticedOn < last.AddMonths(1))
            .Select(s => new HobbySessionFact(s.HobbyId, s.PracticedOn, s.Minutes))
            .ToListAsync();
        return LeisureFigures.ByMonth(sessions, first, last);
    }

    public async Task<OperationResult<HobbyDetailDto>> GetAsync(int id)
    {
        var hobby = await db.Hobbies.Where(h => h.Id == id).Select(ToDetailDto).FirstOrDefaultAsync();
        return hobby is null ? OperationResult<HobbyDetailDto>.Fail(NotFound) : OperationResult<HobbyDetailDto>.Ok(hobby);
    }

    public async Task<OperationResult<HobbyDetailDto>> CreateAsync(HobbyRequest request)
    {
        var hobby = new Hobby { UserId = db.CurrentUserId!.Value };
        var error = await ApplyAsync(hobby, request, null);
        if (error is not null)
        {
            return OperationResult<HobbyDetailDto>.Fail(error);
        }

        db.Hobbies.Add(hobby);
        return await SaveAsync(hobby);
    }

    public async Task<OperationResult<HobbyDetailDto>> UpdateAsync(int id, HobbyRequest request)
    {
        var hobby = await db.Hobbies.FindAsync(id);
        if (hobby is null)
        {
            return OperationResult<HobbyDetailDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(hobby, request, id);
        if (error is not null)
        {
            return OperationResult<HobbyDetailDto>.Fail(error);
        }

        hobby.UpdatedAt = DateTime.UtcNow;
        return await SaveAsync(hobby);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var hobby = await db.Hobbies.FindAsync(id);
        if (hobby is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        await db.HobbySessions.Where(s => s.HobbyId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.IsDeleted, true).SetProperty(x => x.DeletedAt, now));
        hobby.IsDeleted = true;
        hobby.DeletedAt = now;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(HobbyLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(HobbyLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task<OperationResult<HobbySessionDto>> AddSessionAsync(int hobbyId, HobbySessionRequest request)
    {
        var hobby = await db.Hobbies.FindAsync(hobbyId);
        if (hobby is null)
        {
            return OperationResult<HobbySessionDto>.Fail(NotFound);
        }

        var error = LeisureRules.CheckSession(request.PracticedOn, request.Today);
        if (error is not null)
        {
            return OperationResult<HobbySessionDto>.Fail(error);
        }

        var session = new HobbySession { UserId = hobby.UserId, HobbyId = hobbyId };
        ApplySession(session, request);
        db.HobbySessions.Add(session);
        await db.SaveChangesAsync();
        return OperationResult<HobbySessionDto>.Ok(ToSessionDto(session));
    }

    public async Task<OperationResult<HobbySessionDto>> UpdateSessionAsync(int hobbyId, int sessionId, HobbySessionRequest request)
    {
        var session = await db.HobbySessions.FirstOrDefaultAsync(s => s.Id == sessionId && s.HobbyId == hobbyId);
        if (session is null)
        {
            return OperationResult<HobbySessionDto>.Fail(SessionNotFound);
        }

        var error = LeisureRules.CheckSession(request.PracticedOn, request.Today);
        if (error is not null)
        {
            return OperationResult<HobbySessionDto>.Fail(error);
        }

        ApplySession(session, request);
        session.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<HobbySessionDto>.Ok(ToSessionDto(session));
    }

    public async Task<OperationResult<bool>> DeleteSessionAsync(int hobbyId, int sessionId)
    {
        var session = await db.HobbySessions.FirstOrDefaultAsync(s => s.Id == sessionId && s.HobbyId == hobbyId);
        if (session is null)
        {
            return OperationResult<bool>.Fail(SessionNotFound);
        }

        session.IsDeleted = true;
        session.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<OperationResult<HobbyDetailDto>> SaveAsync(Hobby hobby)
    {
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            // Two saves with the same name at once: the index catches the one the pre-check couldn't.
            db.Entry(hobby).State = EntityState.Detached;
            return OperationResult<HobbyDetailDto>.Fail(DuplicateName);
        }

        return await GetAsync(hobby.Id);
    }

    private async Task<string?> ApplyAsync(Hobby hobby, HobbyRequest request, int? id)
    {
        var name = request.Name.Trim();
        if (name.Length == 0)
        {
            return "Give the hobby a name.";
        }

        if (await db.Hobbies.AnyAsync(h => h.Name == name && h.Id != id))
        {
            return DuplicateName;
        }

        // Another user's habit or life area counts as missing (the filters apply).
        if (request.HabitId is { } habitId && !await db.Habits.AnyAsync(h => h.Id == habitId))
        {
            return "Habit not found.";
        }

        if (request.LifeAreaId is { } areaId && !await db.LifeAreas.AnyAsync(a => a.Id == areaId))
        {
            return "Life area not found.";
        }

        hobby.Name = name;
        hobby.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        hobby.Status = request.Status;
        hobby.HabitId = request.HabitId;
        hobby.LifeAreaId = request.LifeAreaId;
        return null;
    }

    private static void ApplySession(HobbySession session, HobbySessionRequest request)
    {
        session.PracticedOn = request.PracticedOn;
        session.Minutes = request.Minutes;
        session.StartedAt = request.StartedAt;
        session.Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
    }

    private static HobbySessionDto ToSessionDto(HobbySession s) => new()
    {
        Id = s.Id,
        HobbyId = s.HobbyId,
        PracticedOn = s.PracticedOn,
        Minutes = s.Minutes,
        StartedAt = s.StartedAt,
        Note = s.Note,
    };

    // The soft-delete filter doesn't reach into a projection's collections, so they filter IsDeleted themselves.
    private static readonly Expression<Func<Hobby, HobbyDto>> ToDto = h => new HobbyDto
    {
        Id = h.Id,
        Name = h.Name,
        Description = h.Description,
        Status = h.Status,
        HabitId = h.Habit != null && !h.Habit.IsDeleted ? h.HabitId : null,
        HabitTitle = h.Habit != null && !h.Habit.IsDeleted ? h.Habit.Title : null,
        LifeAreaId = h.LifeAreaId,
        LifeAreaName = h.LifeArea != null ? h.LifeArea.Name : null,
        SessionCount = h.HobbySessions.Count(s => !s.IsDeleted),
        TotalMinutes = h.HobbySessions.Where(s => !s.IsDeleted).Sum(s => s.Minutes),
        LastPracticedOn = h.HobbySessions.Where(s => !s.IsDeleted).Max(s => (DateOnly?)s.PracticedOn),
    };

    private static readonly Expression<Func<Hobby, HobbyDetailDto>> ToDetailDto = h => new HobbyDetailDto
    {
        Id = h.Id,
        Name = h.Name,
        Description = h.Description,
        Status = h.Status,
        HabitId = h.Habit != null && !h.Habit.IsDeleted ? h.HabitId : null,
        HabitTitle = h.Habit != null && !h.Habit.IsDeleted ? h.Habit.Title : null,
        LifeAreaId = h.LifeAreaId,
        LifeAreaName = h.LifeArea != null ? h.LifeArea.Name : null,
        SessionCount = h.HobbySessions.Count(s => !s.IsDeleted),
        TotalMinutes = h.HobbySessions.Where(s => !s.IsDeleted).Sum(s => s.Minutes),
        LastPracticedOn = h.HobbySessions.Where(s => !s.IsDeleted).Max(s => (DateOnly?)s.PracticedOn),
        Sessions = h.HobbySessions.Where(s => !s.IsDeleted)
            .OrderByDescending(s => s.PracticedOn).ThenByDescending(s => s.Id)
            .Select(s => new HobbySessionDto
            {
                Id = s.Id, HobbyId = s.HobbyId, PracticedOn = s.PracticedOn, Minutes = s.Minutes, StartedAt = s.StartedAt, Note = s.Note,
            })
            .ToList(),
    };
}
