using AutoMapper;
using AutoMapper.QueryableExtensions;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Shared.Services;

public class TagsService(AppDbContext db, IMapper mapper) : ITagsService
{
    public async Task<List<TagDto>> GetAllAsync()
    {
        return await db.Tags
            .OrderBy(t => t.Name)
            .ProjectTo<TagDto>(mapper.ConfigurationProvider)
            .ToListAsync();
    }

    public async Task<OperationResult<TagDto>> CreateAsync(string name)
    {
        name = name.Trim();
        var nameExists = await db.Tags.AnyAsync(t => t.Name == name);
        if (nameExists)
        {
            return OperationResult<TagDto>.Fail("A tag with this name already exists.");
        }

        var tag = new Tag { Name = name, UserId = db.CurrentUserId!.Value };
        db.Tags.Add(tag);

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<TagDto>.Fail("A tag with this name already exists.");
        }

        return OperationResult<TagDto>.Ok(mapper.Map<TagDto>(tag));
    }

    public async Task<OperationResult<TagDto>> RenameAsync(int id, string name)
    {
        name = name.Trim();
        var tag = await db.Tags.FindAsync(id);
        if (tag is null)
        {
            return OperationResult<TagDto>.Fail("Tag not found.");
        }

        var nameExists = await db.Tags.AnyAsync(t => t.Name == name && t.Id != id);
        if (nameExists)
        {
            return OperationResult<TagDto>.Fail("A tag with this name already exists.");
        }

        tag.Name = name;
        tag.UpdatedAt = DateTime.UtcNow;

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<TagDto>.Fail("A tag with this name already exists.");
        }

        return OperationResult<TagDto>.Ok(mapper.Map<TagDto>(tag));
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var tag = await db.Tags.FindAsync(id);
        if (tag is null)
        {
            return OperationResult<bool>.Fail("Tag not found.");
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginTransactionAsync();

        // Detach the tag from everything it was on; each module's tag join table gets a line here.
        await db.GoalTags
            .Where(gt => gt.TagId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(gt => gt.IsDeleted, true).SetProperty(gt => gt.DeletedAt, now));

        tag.IsDeleted = true;
        tag.DeletedAt = now;
        await db.SaveChangesAsync();
        await transaction.CommitAsync();

        return OperationResult<bool>.Ok(true);
    }
}
