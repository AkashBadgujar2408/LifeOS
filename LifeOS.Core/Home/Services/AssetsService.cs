using System.Linq.Expressions;
using LifeOS.Core.Calendar.ServiceContracts;
using LifeOS.Core.Career.Services;
using LifeOS.Core.Home.DTOs;
using LifeOS.Core.Home.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.ServiceContracts;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Home.Services;

/// <summary>
/// The inventory: what you own, by property and room, categories as tags. Letting something go (sold, donated,
/// thrown out, lost) fills its disposal fields — it leaves the inventory and keeps its history; never a delete.
/// </summary>
public class AssetsService(
    AppDbContext db,
    IWarrantiesService warrantiesService,
    IEntityLinksService entityLinksService,
    IRemindersService remindersService,
    IAttachmentsService attachmentsService) : IAssetsService
{
    private const string NotFound = "Item not found.";

    public async Task<List<AssetDto>> GetAllAsync(bool includeDisposed)
    {
        var query = db.Assets.AsQueryable();
        if (!includeDisposed)
        {
            query = query.Where(a => a.DisposedOn == null);
        }

        return await query.OrderBy(a => a.Name).ThenBy(a => a.Id).Select(ToDto).ToListAsync();
    }

    public async Task<OperationResult<AssetDto>> GetAsync(int id)
    {
        var asset = await db.Assets.Where(a => a.Id == id).Select(ToDto).FirstOrDefaultAsync();
        return asset is null ? OperationResult<AssetDto>.Fail(NotFound) : OperationResult<AssetDto>.Ok(asset);
    }

    public async Task<OperationResult<AssetDto>> CreateAsync(AssetRequest request)
    {
        var userId = db.CurrentUserId!.Value;
        var asset = new Asset { UserId = userId };
        var error = await ApplyAsync(asset, request);
        if (error is not null)
        {
            return OperationResult<AssetDto>.Fail(error);
        }

        foreach (var tagId in request.TagIds.Distinct())
        {
            asset.AssetTags.Add(new AssetTag { UserId = userId, TagId = tagId });
        }

        db.Assets.Add(asset);
        await db.SaveChangesAsync();
        return await GetAsync(asset.Id);
    }

    public async Task<OperationResult<AssetDto>> UpdateAsync(int id, AssetRequest request)
    {
        var asset = await db.Assets.FindAsync(id);
        if (asset is null)
        {
            return OperationResult<AssetDto>.Fail(NotFound);
        }

        var error = await ApplyAsync(asset, request);
        if (error is not null)
        {
            return OperationResult<AssetDto>.Fail(error);
        }

        // A disposal can't come before the (possibly changed) purchase day — the CHECK would refuse it anyway.
        if (asset.DisposedOn is { } disposed && asset.PurchasedOn is { } bought && disposed < bought)
        {
            return OperationResult<AssetDto>.Fail("It was let go before that day — change the purchase day or the disposal first.");
        }

        if (asset.DisposalAmount is not null && asset.Currency is null)
        {
            return OperationResult<AssetDto>.Fail("Keep a currency: it was sold for an amount.");
        }

        asset.UpdatedAt = DateTime.UtcNow;
        var wanted = request.TagIds.ToHashSet();
        var current = await db.AssetTags.Where(t => t.AssetId == id).ToListAsync();
        foreach (var tag in current.Where(t => !wanted.Contains(t.TagId)))
        {
            tag.IsDeleted = true;
            tag.DeletedAt = DateTime.UtcNow;
        }

        foreach (var tagId in wanted.Except(current.Select(t => t.TagId)))
        {
            db.AssetTags.Add(new AssetTag { UserId = asset.UserId, AssetId = id, TagId = tagId });
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<AssetDto>.Fail("This item was changed somewhere else at the same time. Reload and try again.");
        }

        return await GetAsync(id);
    }

    public async Task<OperationResult<AssetDto>> SetDisposalAsync(int id, DisposalRequest request)
    {
        var asset = await db.Assets.FindAsync(id);
        if (asset is null)
        {
            return OperationResult<AssetDto>.Fail(NotFound);
        }

        if (request.Today == default)
        {
            return OperationResult<AssetDto>.Fail("Today's date is required.");
        }

        var currency = request.Amount is null ? null : CareerRules.Currency(request.Currency ?? asset.Currency);
        var error = HomeRules.CheckDisposal(request.Kind, request.On, request.Amount, currency, asset.PurchasedOn, request.Today);
        if (error is not null)
        {
            return OperationResult<AssetDto>.Fail(error);
        }

        if (currency is not null && asset.Currency is not null && asset.PurchasePrice is not null && currency != asset.Currency)
        {
            return OperationResult<AssetDto>.Fail($"Give what it sold for in {asset.Currency}, the currency it was bought in.");
        }

        asset.DisposalKind = request.Kind;
        asset.DisposedOn = request.Kind is null ? null : request.On;
        asset.DisposalAmount = request.Kind is null ? null : request.Amount;
        asset.Currency = asset.Currency ?? currency;
        asset.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return await GetAsync(id);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var asset = await db.Assets.FindAsync(id);
        if (asset is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        await db.AssetTags.Where(t => t.AssetId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.IsDeleted, true).SetProperty(t => t.DeletedAt, now));
        await db.MaintenanceTasks.Where(m => m.AssetId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.AssetId, (int?)null).SetProperty(m => m.UpdatedAt, now));
        await warrantiesService.RemoveAsync(await db.Warranties.Where(w => w.AssetId == id).Select(w => w.Id).ToListAsync());
        // The purchase that brought it stays (you did buy it).
        await db.Purchases.Where(p => p.AssetId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.AssetId, (int?)null).SetProperty(p => p.UpdatedAt, now));
        asset.IsDeleted = true;
        asset.DeletedAt = now;
        await db.SaveChangesAsync();
        await attachmentsService.RemoveAllForEntityAsync(AssetLinkableProvider.Type, id);
        await entityLinksService.RemoveAllForEntityAsync(AssetLinkableProvider.Type, id);
        await remindersService.RemoveAllForEntityAsync(AssetLinkableProvider.Type, id);
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    private async Task<string?> ApplyAsync(Asset asset, AssetRequest request)
    {
        var name = request.Name.Trim();
        if (name.Length == 0)
        {
            return "Name it (e.g. Fridge, Work laptop).";
        }

        if (request.Today == default)
        {
            return "Today's date is required.";
        }

        var currency = request.PurchasePrice is null && asset.DisposalAmount is null ? null : CareerRules.Currency(request.Currency);
        var error = HomeRules.CheckAsset(request.Quantity, request.PurchasedOn, request.PurchasePrice, currency, request.Today);
        if (error is not null)
        {
            return error;
        }

        if (request.PropertyId is { } propertyId && !await db.Properties.AnyAsync(p => p.Id == propertyId))
        {
            return "Property not found.";
        }

        var tagIds = request.TagIds.Distinct().ToList();
        if (tagIds.Count > 0 && await db.Tags.CountAsync(t => tagIds.Contains(t.Id)) != tagIds.Count)
        {
            return "Tag not found.";
        }

        asset.Name = name;
        asset.PropertyId = request.PropertyId;
        asset.Room = Clean(request.Room);
        asset.Brand = Clean(request.Brand);
        asset.Model = Clean(request.Model);
        asset.SerialNumber = Clean(request.SerialNumber);
        asset.Quantity = request.Quantity;
        asset.PurchasedOn = request.PurchasedOn;
        asset.PurchasePrice = request.PurchasePrice;
        asset.Currency = currency;
        asset.Notes = Clean(request.Notes);
        return null;
    }

    private static string? Clean(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();

    private static readonly Expression<Func<Asset, AssetDto>> ToDto = a => new AssetDto
    {
        Id = a.Id,
        Name = a.Name,
        PropertyId = a.PropertyId,
        PropertyName = a.Property != null ? a.Property.Name : null,
        Room = a.Room,
        Brand = a.Brand,
        Model = a.Model,
        SerialNumber = a.SerialNumber,
        Quantity = a.Quantity,
        PurchasedOn = a.PurchasedOn,
        PurchasePrice = a.PurchasePrice,
        Currency = a.Currency,
        DisposedOn = a.DisposedOn,
        DisposalKind = a.DisposalKind,
        DisposalAmount = a.DisposalAmount,
        Notes = a.Notes,
        Tags = a.AssetTags.OrderBy(t => t.Tag.Name).Select(t => new TagDto { Id = t.TagId, Name = t.Tag.Name }).ToList(),
        CoveredUntil = a.Warranties.Max(w => (DateOnly?)w.ExpiresOn),
    };
}
