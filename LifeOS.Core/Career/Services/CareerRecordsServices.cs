using System.Linq.Expressions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Career.DTOs;
using LifeOS.Core.Career.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Career.Services;

/// <summary>
/// Resume versions ("Backend — Oct 2026"). The file itself is an attachment on the version (type ResumeVersion);
/// applications say which version they were sent with. Names are unique per user.
/// </summary>
public class ResumeVersionsService(
    AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService, IAttachmentsService attachmentsService)
    : IResumeVersionsService
{
    private const string NotFound = "Resume version not found.";
    private const string Duplicate = "You already have a resume version with that name.";

    public async Task<List<ResumeVersionDto>> GetAllAsync() =>
        await db.ResumeVersions.OrderByDescending(r => r.CreatedAt).ThenByDescending(r => r.Id).Select(ToDto).ToListAsync();

    public async Task<OperationResult<ResumeVersionDto>> GetAsync(int id)
    {
        var resume = await db.ResumeVersions.Where(r => r.Id == id).Select(ToDto).FirstOrDefaultAsync();
        return resume is null ? OperationResult<ResumeVersionDto>.Fail(NotFound) : OperationResult<ResumeVersionDto>.Ok(resume);
    }

    public async Task<OperationResult<ResumeVersionDto>> CreateAsync(ResumeVersionRequest request)
    {
        var resume = new ResumeVersion { UserId = db.CurrentUserId!.Value };
        var error = await ApplyAsync(resume, request);
        if (error is not null)
        {
            return OperationResult<ResumeVersionDto>.Fail(error);
        }

        db.ResumeVersions.Add(resume);
        return await SaveAsync(resume);
    }

    public async Task<OperationResult<ResumeVersionDto>> UpdateAsync(int id, ResumeVersionRequest request)
    {
        var resume = await db.ResumeVersions.FindAsync(id);
        if (resume is null)
        {
            return OperationResult<ResumeVersionDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(resume, request);
        if (error is not null)
        {
            return OperationResult<ResumeVersionDto>.Fail(error);
        }

        resume.UpdatedAt = DateTime.UtcNow;
        return await SaveAsync(resume);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var resume = await db.ResumeVersions.FindAsync(id);
        if (resume is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        // Applications sent with it keep everything but the reference.
        await db.JobApplications.Where(a => a.ResumeVersionId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.ResumeVersionId, (int?)null).SetProperty(a => a.UpdatedAt, now));
        resume.IsDeleted = true;
        resume.DeletedAt = now;
        await db.SaveChangesAsync();
        await attachmentsService.RemoveAllForEntityAsync(ResumeVersionLinkableProvider.Type, id);
        await entityLinksService.RemoveAllForEntityAsync(ResumeVersionLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(ResumeVersionLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<OperationResult<ResumeVersionDto>> SaveAsync(ResumeVersion resume)
    {
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<ResumeVersionDto>.Fail(Duplicate);
        }

        return await GetAsync(resume.Id);
    }

    private async Task<string?> ApplyAsync(ResumeVersion resume, ResumeVersionRequest request)
    {
        var name = request.Name.Trim();
        if (name.Length == 0)
        {
            return "Name the version.";
        }

        if (await db.ResumeVersions.AnyAsync(r => r.Name == name && r.Id != resume.Id))
        {
            return Duplicate;
        }

        resume.Name = name;
        resume.TargetRole = string.IsNullOrWhiteSpace(request.TargetRole) ? null : request.TargetRole.Trim();
        resume.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        return null;
    }

    private Expression<Func<ResumeVersion, ResumeVersionDto>> ToDto => r => new ResumeVersionDto
    {
        Id = r.Id,
        Name = r.Name,
        TargetRole = r.TargetRole,
        Notes = r.Notes,
        CreatedAt = r.CreatedAt,
        FileCount = db.Attachments.Count(a => a.EntityType == ResumeVersionLinkableProvider.Type && a.EntityId == r.Id),
        Applications = r.JobApplications
            .OrderByDescending(a => a.UpdatedAt ?? a.CreatedAt)
            .Select(a => new ResumeApplicationDto
            {
                Id = a.Id,
                Role = a.Role,
                Organisation = a.Organisation,
                Stage = a.Stage,
                AppliedOn = a.AppliedOn,
            })
            .ToList(),
    };
}

/// <summary>Resume versions take files (attachments), links and reminders, and can be found by search.</summary>
public class ResumeVersionLinkableProvider(AppDbContext db) : ILinkableEntityProvider
{
    public const string Type = "ResumeVersion";

    public string EntityType => Type;

    public string DisplayName => "Resume version";

    public async Task<Dictionary<int, string>> GetTitlesAsync(IReadOnlyCollection<int> ids) =>
        await db.ResumeVersions.Where(r => ids.Contains(r.Id)).ToDictionaryAsync(r => r.Id, r => r.Name);

    public async Task<List<LinkableItemDto>> SearchAsync(string? search, int take)
    {
        var query = db.ResumeVersions.AsQueryable();
        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(r => r.Name.Contains(search) || (r.TargetRole != null && r.TargetRole.Contains(search)));
        }

        return await query
            .OrderByDescending(r => r.CreatedAt)
            .Take(take)
            .Select(r => new LinkableItemDto { EntityType = Type, EntityId = r.Id, Title = r.Name })
            .ToListAsync();
    }
}

/// <summary>Appraisals: when, for which period, the rating in the company's own words, strengths and what to work on.</summary>
public class PerformanceReviewsService(AppDbContext db) : IPerformanceReviewsService
{
    private const string NotFound = "Review not found.";

    public async Task<List<PerformanceReviewDto>> GetAllAsync() =>
        await db.PerformanceReviews.OrderByDescending(r => r.ReviewedOn).ThenByDescending(r => r.Id).Select(ToDto).ToListAsync();

    public async Task<OperationResult<PerformanceReviewDto>> CreateAsync(PerformanceReviewRequest request)
    {
        var review = new PerformanceReview { UserId = db.CurrentUserId!.Value };
        var error = await ApplyAsync(review, request);
        if (error is not null)
        {
            return OperationResult<PerformanceReviewDto>.Fail(error);
        }

        db.PerformanceReviews.Add(review);
        await db.SaveChangesAsync();
        return await GetAsync(review.Id);
    }

    public async Task<OperationResult<PerformanceReviewDto>> UpdateAsync(int id, PerformanceReviewRequest request)
    {
        var review = await db.PerformanceReviews.FindAsync(id);
        if (review is null)
        {
            return OperationResult<PerformanceReviewDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(review, request);
        if (error is not null)
        {
            return OperationResult<PerformanceReviewDto>.Fail(error);
        }

        review.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var review = await db.PerformanceReviews.FindAsync(id);
        if (review is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        review.IsDeleted = true;
        review.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<OperationResult<PerformanceReviewDto>> GetAsync(int id)
    {
        var review = await db.PerformanceReviews.Where(r => r.Id == id).Select(ToDto).FirstOrDefaultAsync();
        return review is null ? OperationResult<PerformanceReviewDto>.Fail(NotFound) : OperationResult<PerformanceReviewDto>.Ok(review);
    }

    private async Task<string?> ApplyAsync(PerformanceReview review, PerformanceReviewRequest request)
    {
        if (request.ReviewedOn == default || request.Today == default)
        {
            return "The date is required.";
        }

        if (request.ReviewedOn > request.Today)
        {
            return "A review can't be in the future.";
        }

        if (request.EmploymentId is { } id)
        {
            var role = await db.Employments.Where(e => e.Id == id).Select(e => new { e.StartDate, e.EndDate }).FirstOrDefaultAsync();
            if (role is null)
            {
                return "Role not found.";
            }

            if (CareerRules.CheckDayInRole(request.ReviewedOn, role.StartDate, role.EndDate) is { } dayError)
            {
                return dayError;
            }
        }

        review.EmploymentId = request.EmploymentId;
        review.ReviewedOn = request.ReviewedOn;
        review.PeriodLabel = Clean(request.PeriodLabel);
        review.Rating = Clean(request.Rating);
        review.Strengths = Clean(request.Strengths);
        review.Improvements = Clean(request.Improvements);
        review.Notes = Clean(request.Notes);
        return review.Rating is null && review.Strengths is null && review.Improvements is null && review.Notes is null
            ? "Write down the rating or some of the feedback."
            : null;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static readonly Expression<Func<PerformanceReview, PerformanceReviewDto>> ToDto = r => new PerformanceReviewDto
    {
        Id = r.Id,
        EmploymentId = r.EmploymentId,
        Organisation = r.Employment != null ? r.Employment.Organisation : null,
        Role = r.Employment != null ? r.Employment.Role : null,
        ReviewedOn = r.ReviewedOn,
        PeriodLabel = r.PeriodLabel,
        Rating = r.Rating,
        Strengths = r.Strengths,
        Improvements = r.Improvements,
        Notes = r.Notes,
    };
}

/// <summary>
/// Income beside the job — what it is and whether it's going. What it earns is recorded in Finance (Session 55+).
/// </summary>
public class SideIncomeSourcesService(AppDbContext db) : ISideIncomeSourcesService
{
    private const string NotFound = "Side income source not found.";

    /// <summary>Active, then paused, then ended; newest start first within each.</summary>
    public async Task<List<SideIncomeSourceDto>> GetAllAsync() =>
        await db.SideIncomeSources
            .OrderBy(s => s.Status == SideIncomeStatuses.Active ? 0 : s.Status == SideIncomeStatuses.Paused ? 1 : 2)
            .ThenByDescending(s => s.StartedOn).ThenBy(s => s.Name)
            .Select(ToDto)
            .ToListAsync();

    public async Task<OperationResult<SideIncomeSourceDto>> CreateAsync(SideIncomeSourceRequest request)
    {
        var source = new SideIncomeSource { UserId = db.CurrentUserId!.Value };
        var error = Apply(source, request);
        if (error is not null)
        {
            return OperationResult<SideIncomeSourceDto>.Fail(error);
        }

        db.SideIncomeSources.Add(source);
        await db.SaveChangesAsync();
        return await GetAsync(source.Id);
    }

    public async Task<OperationResult<SideIncomeSourceDto>> UpdateAsync(int id, SideIncomeSourceRequest request)
    {
        var source = await db.SideIncomeSources.FindAsync(id);
        if (source is null)
        {
            return OperationResult<SideIncomeSourceDto>.Fail(NotFound);
        }

        var error = Apply(source, request);
        if (error is not null)
        {
            return OperationResult<SideIncomeSourceDto>.Fail(error);
        }

        source.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var source = await db.SideIncomeSources.FindAsync(id);
        if (source is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        // What it earned stays in Finance, just no longer filed under it.
        await db.Transactions.Where(t => t.SideIncomeSourceId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.SideIncomeSourceId, (int?)null).SetProperty(x => x.UpdatedAt, now));
        source.IsDeleted = true;
        source.DeletedAt = now;
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<OperationResult<SideIncomeSourceDto>> GetAsync(int id)
    {
        var source = await db.SideIncomeSources.Where(s => s.Id == id).Select(ToDto).FirstOrDefaultAsync();
        return source is null ? OperationResult<SideIncomeSourceDto>.Fail(NotFound) : OperationResult<SideIncomeSourceDto>.Ok(source);
    }

    private static string? Apply(SideIncomeSource source, SideIncomeSourceRequest request)
    {
        var name = request.Name.Trim();
        if (name.Length == 0)
        {
            return "Name the source.";
        }

        if (request.Today == default)
        {
            return "Today's date is required.";
        }

        if (CareerRules.CheckSideIncome(request.Kind, request.Status, request.StartedOn, request.EndedOn, request.Today) is { } error)
        {
            return error;
        }

        if (!CareerRules.IsWebAddress(request.Url))
        {
            return "The link has to be a web address (https://…).";
        }

        source.Name = name;
        source.Kind = request.Kind;
        source.Status = request.Status;
        source.StartedOn = request.StartedOn;
        source.EndedOn = request.EndedOn;
        source.Url = string.IsNullOrWhiteSpace(request.Url) ? null : request.Url.Trim();
        source.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        return null;
    }

    private static readonly Expression<Func<SideIncomeSource, SideIncomeSourceDto>> ToDto = s => new SideIncomeSourceDto
    {
        Id = s.Id,
        Name = s.Name,
        Kind = s.Kind,
        Status = s.Status,
        StartedOn = s.StartedOn,
        EndedOn = s.EndedOn,
        Url = s.Url,
        Notes = s.Notes,
    };
}
