using System.Linq.Expressions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Career.DTOs;
using LifeOS.Core.Career.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Career.Services;

/// <summary>
/// Mock interviews (Session 54a): a record of practice interviews done by voice with an AI outside LifeOS — the day,
/// which AI, how long, the role, the rating as it said it, strengths, what to improve and your notes. On an
/// application or general practice; linked to the questions to practise through EntityLinks.
/// </summary>
public class MockInterviewsService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService)
    : IMockInterviewsService
{
    private const string NotFound = "Mock interview not found.";

    public async Task<List<MockInterviewDto>> GetAllAsync(int? applicationId)
    {
        var query = db.MockInterviews.AsQueryable();
        if (applicationId is { } application)
        {
            query = query.Where(m => m.JobApplicationId == application);
        }

        return await query.OrderByDescending(m => m.HeldOn).ThenByDescending(m => m.Id).Select(ToDto).ToListAsync();
    }

    public async Task<OperationResult<MockInterviewDto>> GetAsync(int id)
    {
        var mock = await db.MockInterviews.Where(m => m.Id == id).Select(ToDto).FirstOrDefaultAsync();
        return mock is null ? OperationResult<MockInterviewDto>.Fail(NotFound) : OperationResult<MockInterviewDto>.Ok(mock);
    }

    public async Task<OperationResult<MockInterviewDto>> CreateAsync(MockInterviewRequest request)
    {
        var mock = new MockInterview { UserId = db.CurrentUserId!.Value };
        var error = await ApplyAsync(mock, request);
        if (error is not null)
        {
            return OperationResult<MockInterviewDto>.Fail(error);
        }

        db.MockInterviews.Add(mock);
        await db.SaveChangesAsync();
        return await GetAsync(mock.Id);
    }

    public async Task<OperationResult<MockInterviewDto>> UpdateAsync(int id, MockInterviewRequest request)
    {
        var mock = await db.MockInterviews.FindAsync(id);
        if (mock is null)
        {
            return OperationResult<MockInterviewDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(mock, request);
        if (error is not null)
        {
            return OperationResult<MockInterviewDto>.Fail(error);
        }

        mock.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var mock = await db.MockInterviews.FindAsync(id);
        if (mock is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        mock.IsDeleted = true;
        mock.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(MockInterviewLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(MockInterviewLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<string?> ApplyAsync(MockInterview mock, MockInterviewRequest request)
    {
        var error = CareerRules.CheckMockInterview(request.HeldOn, request.Tool, request.DurationMinutes, request.Today);
        if (error is not null)
        {
            return error;
        }

        if (request.JobApplicationId is { } applicationId && !await db.JobApplications.AnyAsync(a => a.Id == applicationId))
        {
            return "Application not found.";
        }

        mock.HeldOn = request.HeldOn;
        mock.Tool = request.Tool.Trim();
        mock.DurationMinutes = request.DurationMinutes;
        mock.Role = Clean(request.Role);
        mock.Rating = Clean(request.Rating);
        mock.Strengths = Clean(request.Strengths);
        mock.Improvements = Clean(request.Improvements);
        mock.Notes = Clean(request.Notes);
        mock.JobApplicationId = request.JobApplicationId;
        return null;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static readonly Expression<Func<MockInterview, MockInterviewDto>> ToDto = m => new MockInterviewDto
    {
        Id = m.Id,
        HeldOn = m.HeldOn,
        Tool = m.Tool,
        DurationMinutes = m.DurationMinutes,
        Role = m.Role,
        Rating = m.Rating,
        Strengths = m.Strengths,
        Improvements = m.Improvements,
        Notes = m.Notes,
        JobApplicationId = m.JobApplicationId,
        ApplicationTitle = m.JobApplication != null ? m.JobApplication.Role + " at " + m.JobApplication.Organisation : null,
    };
}

/// <summary>
/// Mock interviews can be linked (to the questions to practise), have reminders and be found by search (by the
/// role, the AI or what to improve). Titled "Mock interview · Backend engineer".
/// </summary>
public class MockInterviewLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "MockInterview";

    public string EntityType => Type;

    public string DisplayName => "Mock interview";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.MockInterviews.Where(m => ids.Contains(m.Id))
            .Select(m => new { m.Id, Title = Title(m.Role, m.JobApplication != null ? m.JobApplication.Role : null, m.Tool) })
            .ToDictionaryAsync(m => m.Id, m => m.Title);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.MockInterviews.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(m =>
                m.Tool.Contains(search)
                || (m.Role != null && m.Role.Contains(search))
                || (m.JobApplication != null && (m.JobApplication.Role.Contains(search) || m.JobApplication.Organisation.Contains(search)))
                || (m.Improvements != null && m.Improvements.Contains(search)));
        }

        var rows = await query
            .OrderByDescending(m => m.HeldOn)
            .ThenByDescending(m => m.Id)
            .Take(take)
            .Select(m => new { m.Id, m.Role, ApplicationRole = m.JobApplication != null ? m.JobApplication.Role : null, m.Tool })
            .ToListAsync();
        return rows.Select(m => new LinkableItemDto { EntityType = Type, EntityId = m.Id, Title = Title(m.Role, m.ApplicationRole, m.Tool) })
            .ToList();
    }

    /// <summary>"Mock interview · Backend engineer", else "Mock interview with Gemini".</summary>
    internal static string Title(string? role, string? applicationRole, string tool) =>
        (role ?? applicationRole) is { } r ? $"Mock interview · {r}" : $"Mock interview with {tool}";
}
