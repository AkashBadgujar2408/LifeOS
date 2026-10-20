using LifeOS.Core.Purchases.DTOs;
using LifeOS.Core.Purchases.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Purchases.Controllers;

/// <summary>Shared reply shapes for Purchases' controllers: a business failure is a 400, a missing item a 404.</summary>
public abstract class PurchasesControllerBase : ControllerBase
{
    protected IActionResult Result<T>(OperationResult<T> result) =>
        result.Success ? Ok(ApiResponse<T>.Ok(result.Data)) : BadRequest(ApiResponse<T>.Fail(result.Error!));

    protected IActionResult Found<T>(OperationResult<T> result) =>
        result.Success ? Ok(ApiResponse<T>.Ok(result.Data)) : NotFound(ApiResponse<T>.Fail(result.Error!));
}

[ApiController]
[Area("Purchases")]
[Route("api/[area]/[controller]")]
[Authorize]
public class PurchasesController(IPurchasesService purchasesService) : PurchasesControllerBase
{
    /// <summary>GET api/Purchases/Purchases[?from&amp;to] — newest first.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] DateOnly? from, [FromQuery] DateOnly? to) =>
        from is { } f && to is { } t && t < f
            ? BadRequest(ApiResponse<List<PurchaseDto>>.Fail("The end of the range is before its start."))
            : Ok(ApiResponse<List<PurchaseDto>>.Ok(await purchasesService.GetAllAsync(from, to)));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id) => Found(await purchasesService.GetAsync(id));

    /// <summary>GET api/Purchases/Purchases/stores — stores bought from, most used first.</summary>
    [HttpGet("stores")]
    public async Task<IActionResult> Stores() => Ok(ApiResponse<List<string>>.Ok(await purchasesService.StoresAsync()));

    /// <summary>POST — the purchase, and in one step its expense, inventory item, warranty, list items and wish.</summary>
    [HttpPost]
    public async Task<IActionResult> Create(PurchaseRequest request) => Result(await purchasesService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, PurchaseRequest request) => Result(await purchasesService.UpdateAsync(id, request));

    /// <summary>PUT …/{id}/expense — record it in Finance (once).</summary>
    [HttpPut("{id:int}/expense")]
    public async Task<IActionResult> RecordExpense(int id, PurchaseExpenseRequest request) =>
        Result(await purchasesService.RecordExpenseAsync(id, request));

    /// <summary>DELETE …/{id}/expense — take the expense back.</summary>
    [HttpDelete("{id:int}/expense")]
    public async Task<IActionResult> RemoveExpense(int id) => Result(await purchasesService.RemoveExpenseAsync(id));

    /// <summary>DELETE …/{id} — the purchase and its expense; the inventory item stays.</summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) => Found(await purchasesService.DeleteAsync(id));
}

[ApiController]
[Area("Purchases")]
[Route("api/[area]/[controller]")]
[Authorize]
public class ShoppingListsController(IShoppingListsService listsService) : PurchasesControllerBase
{
    /// <summary>GET api/Purchases/ShoppingLists[?includeArchived=true] — with counts and what's left to spend.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] bool includeArchived = false) =>
        Ok(ApiResponse<List<ShoppingListDto>>.Ok(await listsService.GetAllAsync(includeArchived)));

    /// <summary>GET …/{id} — the list with its items.</summary>
    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id) => Found(await listsService.GetAsync(id));

    [HttpPost]
    public async Task<IActionResult> Create(ShoppingListRequest request) => Result(await listsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, ShoppingListRequest request) => Result(await listsService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) => Found(await listsService.DeleteAsync(id));

    [HttpPost("{id:int}/items")]
    public async Task<IActionResult> AddItem(int id, ShoppingListItemRequest request) => Result(await listsService.AddItemAsync(id, request));

    [HttpPut("{id:int}/items/{itemId:int}")]
    public async Task<IActionResult> UpdateItem(int id, int itemId, ShoppingListItemRequest request) =>
        Result(await listsService.UpdateItemAsync(id, itemId, request));

    /// <summary>PUT …/{id}/items/{itemId}/done — tick or untick.</summary>
    [HttpPut("{id:int}/items/{itemId:int}/done")]
    public async Task<IActionResult> SetDone(int id, int itemId, ItemDoneRequest request) =>
        Result(await listsService.SetDoneAsync(id, itemId, request.Done));

    [HttpDelete("{id:int}/items/{itemId:int}")]
    public async Task<IActionResult> RemoveItem(int id, int itemId) => Result(await listsService.RemoveItemAsync(id, itemId));

    /// <summary>DELETE …/{id}/items/done — clear every ticked item.</summary>
    [HttpDelete("{id:int}/items/done")]
    public async Task<IActionResult> ClearDone(int id) => Result(await listsService.ClearDoneAsync(id));

    /// <summary>PUT …/{id}/items/order — every item id of the list, in the new order.</summary>
    [HttpPut("{id:int}/items/order")]
    public async Task<IActionResult> Reorder(int id, List<int> itemIds) => Result(await listsService.ReorderAsync(id, itemIds));
}

[ApiController]
[Area("Purchases")]
[Route("api/[area]/[controller]")]
[Authorize]
public class WishlistController(IWishlistService wishlistService) : PurchasesControllerBase
{
    /// <summary>GET api/Purchases/Wishlist — most wanted first (at target price, then priority), bought ones last.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll() => Ok(ApiResponse<List<WishlistItemDto>>.Ok(await wishlistService.GetAllAsync()));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id) => Found(await wishlistService.GetAsync(id));

    [HttpPost]
    public async Task<IActionResult> Create(WishlistItemRequest request) => Result(await wishlistService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, WishlistItemRequest request) => Result(await wishlistService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) => Found(await wishlistService.DeleteAsync(id));
}

[ApiController]
[Area("Purchases")]
[Route("api/[area]/[controller]")]
[Authorize]
public class SubscriptionsController(ISubscriptionsService subscriptionsService) : PurchasesControllerBase
{
    /// <summary>GET api/Purchases/Subscriptions?today=&amp;timeZone= — all of them with the active ones' monthly / yearly totals.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] DateOnly today, [FromQuery] string? timeZone) =>
        today == default
            ? BadRequest(ApiResponse<SubscriptionsOverviewDto>.Fail("Today's date is required."))
            : Ok(ApiResponse<SubscriptionsOverviewDto>.Ok(await subscriptionsService.GetAllAsync(today, timeZone)));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id, [FromQuery] DateOnly today) => Found(await subscriptionsService.GetAsync(id, today));

    /// <summary>POST — with an account, its charges are written to Finance by a repeating transaction it owns.</summary>
    [HttpPost]
    public async Task<IActionResult> Create(SubscriptionRequest request) => Result(await subscriptionsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, SubscriptionRequest request) => Result(await subscriptionsService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) => Found(await subscriptionsService.DeleteAsync(id));
}

[ApiController]
[Area("Purchases")]
[Route("api/[area]/[controller]")]
[Authorize]
public class ReturnsController(IReturnsService returnsService) : PurchasesControllerBase
{
    /// <summary>GET api/Purchases/Returns?today= — open first (return-by soonest), then awaiting refund, missed, refunded.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] DateOnly today) =>
        today == default
            ? BadRequest(ApiResponse<List<ReturnDto>>.Fail("Today's date is required."))
            : Ok(ApiResponse<List<ReturnDto>>.Ok(await returnsService.GetAllAsync(today)));

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id, [FromQuery] DateOnly today) => Found(await returnsService.GetAsync(id, today));

    [HttpPost]
    public async Task<IActionResult> Create(ReturnRequest request) => Result(await returnsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, ReturnRequest request) => Result(await returnsService.UpdateAsync(id, request));

    /// <summary>PUT …/{id}/refund — the refund arrived; with an account, one Finance income.</summary>
    [HttpPut("{id:int}/refund")]
    public async Task<IActionResult> Refund(int id, RefundRequest request) => Result(await returnsService.RefundAsync(id, request));

    /// <summary>DELETE …/{id}/refund?today= — not refunded after all (its income is deleted).</summary>
    [HttpDelete("{id:int}/refund")]
    public async Task<IActionResult> UndoRefund(int id, [FromQuery] DateOnly today) => Result(await returnsService.UndoRefundAsync(id, today));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) => Found(await returnsService.DeleteAsync(id));
}

[ApiController]
[Area("Purchases")]
[Route("api/[area]/[controller]")]
[Authorize]
public class AttentionController(IBenefitsService benefitsService, ISubscriptionsService subscriptionsService, IReturnsService returnsService)
    : PurchasesControllerBase
{
    /// <summary>GET api/Purchases/Attention?today= — rewards running out, decide-by and return-by days (My Day).</summary>
    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] DateOnly today)
    {
        if (today == default)
        {
            return BadRequest(ApiResponse<PurchasesAttentionDto>.Fail("Today's date is required."));
        }

        // One context: one query at a time.
        var rewards = await benefitsService.AttentionAsync(today);
        var subscriptions = await subscriptionsService.AttentionAsync(today);
        var returns = await returnsService.AttentionAsync(today);
        return Ok(ApiResponse<PurchasesAttentionDto>.Ok(new PurchasesAttentionDto { Rewards = rewards, Subscriptions = subscriptions, Returns = returns }));
    }
}
