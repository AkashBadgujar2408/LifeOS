using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Learning.DTOs;
using LifeOS.Core.Learning.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Learning.Services;

/// <summary>
/// The skills inventory. A skill's level is its current Proficiency; every change of level (and where it started)
/// is logged to learning.SkillLevelChanges on the user's local day, so the history shows how it grew.
/// </summary>
public class SkillsService(AppDbContext db, IEntityLinksService entityLinksService, IRemindersService remindersService)
    : ISkillsService
{
    private const string NotFound = "Skill not found.";
    private const string DuplicateName = "You already have a skill with that name.";

    public async Task<List<SkillDto>> GetAllAsync() =>
        await db.Skills
            .OrderByDescending(s => s.Proficiency).ThenBy(s => s.Name)
            .Select(s => new SkillDto
            {
                Id = s.Id,
                Name = s.Name,
                Description = s.Description,
                Proficiency = s.Proficiency,
                TargetProficiency = s.TargetProficiency,
                LifeAreaId = s.LifeAreaId,
                LifeAreaName = s.LifeArea != null ? s.LifeArea.Name : null,
                Tags = s.SkillTags.OrderBy(st => st.Tag.Name).Select(st => new TagDto { Id = st.TagId, Name = st.Tag.Name }).ToList(),
                CourseCount = s.Courses.Count,
                BookCount = s.Books.Count,
                LevelSince = s.SkillLevelChanges.OrderByDescending(c => c.ChangedOn).ThenByDescending(c => c.Id)
                    .Select(c => (DateOnly?)c.ChangedOn).FirstOrDefault(),
            })
            .AsSplitQuery()
            .ToListAsync();

    public async Task<OperationResult<SkillDetailDto>> GetAsync(int id)
    {
        var skill = await db.Skills
            .Where(s => s.Id == id)
            .Select(s => new SkillDetailDto
            {
                Id = s.Id,
                Name = s.Name,
                Description = s.Description,
                Proficiency = s.Proficiency,
                TargetProficiency = s.TargetProficiency,
                LifeAreaId = s.LifeAreaId,
                LifeAreaName = s.LifeArea != null ? s.LifeArea.Name : null,
                Tags = s.SkillTags.OrderBy(st => st.Tag.Name).Select(st => new TagDto { Id = st.TagId, Name = st.Tag.Name }).ToList(),
                CourseCount = s.Courses.Count,
                BookCount = s.Books.Count,
                LevelSince = s.SkillLevelChanges.OrderByDescending(c => c.ChangedOn).ThenByDescending(c => c.Id)
                    .Select(c => (DateOnly?)c.ChangedOn).FirstOrDefault(),
                History = s.SkillLevelChanges.OrderByDescending(c => c.ChangedOn).ThenByDescending(c => c.Id)
                    .Select(c => new SkillLevelChangeDto
                    {
                        Id = c.Id,
                        FromProficiency = c.FromProficiency,
                        ToProficiency = c.ToProficiency,
                        ChangedOn = c.ChangedOn,
                        Note = c.Note,
                    }).ToList(),
                Courses = s.Courses.OrderBy(c => c.Title)
                    .Select(c => new LearningItemDto { Id = c.Id, Title = c.Title, Status = c.Status }).ToList(),
                Books = s.Books.OrderBy(b => b.Title)
                    .Select(b => new LearningItemDto { Id = b.Id, Title = b.Title, Status = b.Status }).ToList(),
            })
            .AsSplitQuery()
            .FirstOrDefaultAsync();
        return skill is null ? OperationResult<SkillDetailDto>.Fail(NotFound) : OperationResult<SkillDetailDto>.Ok(skill);
    }

    public async Task<OperationResult<SkillDetailDto>> CreateAsync(SkillRequest request)
    {
        var name = request.Name.Trim();
        var error = await ValidateAsync(request, name, null);
        if (error is not null)
        {
            return OperationResult<SkillDetailDto>.Fail(error);
        }

        var userId = db.CurrentUserId!.Value;
        var skill = new Skill { UserId = userId };
        Apply(skill, request, name);
        skill.SkillLevelChanges.Add(new SkillLevelChange
        {
            UserId = userId,
            ToProficiency = request.Proficiency,
            ChangedOn = request.Today,
            Note = Clean(request.LevelNote),
        });
        foreach (var tagId in request.TagIds.Distinct())
        {
            skill.SkillTags.Add(new SkillTag { UserId = userId, TagId = tagId });
        }

        db.Skills.Add(skill);
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<SkillDetailDto>.Fail(DuplicateName);
        }

        return await GetAsync(skill.Id);
    }

    public async Task<OperationResult<SkillDetailDto>> UpdateAsync(int id, SkillRequest request)
    {
        var skill = await db.Skills.FindAsync(id);
        if (skill is null)
        {
            return OperationResult<SkillDetailDto>.Fail(NotFound);
        }

        var name = request.Name.Trim();
        var error = await ValidateAsync(request, name, id);
        if (error is not null)
        {
            return OperationResult<SkillDetailDto>.Fail(error);
        }

        if (skill.Proficiency != request.Proficiency)
        {
            db.SkillLevelChanges.Add(new SkillLevelChange
            {
                UserId = skill.UserId,
                SkillId = id,
                FromProficiency = skill.Proficiency,
                ToProficiency = request.Proficiency,
                ChangedOn = request.Today,
                Note = Clean(request.LevelNote),
            });
        }

        Apply(skill, request, name);
        skill.UpdatedAt = DateTime.UtcNow;

        var wanted = request.TagIds.ToHashSet();
        var current = await db.SkillTags.Where(st => st.SkillId == id).ToListAsync();
        foreach (var tag in current.Where(st => !wanted.Contains(st.TagId)))
        {
            tag.IsDeleted = true;
            tag.DeletedAt = DateTime.UtcNow;
        }

        foreach (var tagId in wanted.Except(current.Select(st => st.TagId)))
        {
            db.SkillTags.Add(new SkillTag { UserId = skill.UserId, SkillId = id, TagId = tagId });
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<SkillDetailDto>.Fail(DuplicateName);
        }

        return await GetAsync(id);
    }

    /// <summary>
    /// Soft-deletes the skill with its history and tags. Courses, books and the rest that pointed at it keep going
    /// without a skill (like tasks of a deleted project).
    /// </summary>
    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var skill = await db.Skills.FindAsync(id);
        if (skill is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.SkillLevelChanges.Where(c => c.SkillId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.IsDeleted, true).SetProperty(c => c.DeletedAt, now));
        await db.SkillTags.Where(t => t.SkillId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.IsDeleted, true).SetProperty(t => t.DeletedAt, now));
        await db.Courses.Where(c => c.SkillId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.SkillId, (int?)null).SetProperty(c => c.UpdatedAt, now));
        await db.Books.Where(b => b.SkillId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(b => b.SkillId, (int?)null).SetProperty(b => b.UpdatedAt, now));
        await db.Certifications.Where(c => c.SkillId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.SkillId, (int?)null).SetProperty(c => c.UpdatedAt, now));
        await db.KnowledgeNotes.Where(n => n.SkillId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.SkillId, (int?)null).SetProperty(n => n.UpdatedAt, now));
        // Study sessions keep the skill: they're a record of time spent, and "about nothing" isn't allowed.

        skill.IsDeleted = true;
        skill.DeletedAt = now;
        await db.SaveChangesAsync();
        await entityLinksService.RemoveAllForEntityAsync(SkillLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(SkillLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<string?> ValidateAsync(SkillRequest request, string name, int? id)
    {
        if (name.Length == 0)
        {
            return "Name the skill.";
        }

        if (request.Today == default)
        {
            return "Today's date is required.";
        }

        if (await db.Skills.AnyAsync(s => s.Name == name && s.Id != id))
        {
            return DuplicateName;
        }

        return await LearningLookups.CheckAsync(db, request.LifeAreaId, request.TagIds);
    }

    private static void Apply(Skill skill, SkillRequest request, string name)
    {
        skill.Name = name;
        skill.Description = Clean(request.Description);
        skill.Proficiency = request.Proficiency;
        skill.TargetProficiency = request.TargetProficiency;
        skill.LifeAreaId = request.LifeAreaId;
    }

    private static string? Clean(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();
}
