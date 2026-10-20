using LifeOS.Core.Purchases.DTOs;
using LifeOS.Core.Purchases.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LifeOS.Api.Areas.Purchases.Controllers;

[ApiController]
[Area("Purchases")]
[Route("api/[area]/[controller]")]
[Authorize]
public class BenefitsController(IBenefitsService benefitsService) : PurchasesControllerBase
{
    private const string NoToday = "Today's date is required.";

    /// <summary>GET api/Purchases/Benefits?today= — every reward with its balance / points / status today.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] DateOnly today) =>
        today == default
            ? BadRequest(ApiResponse<List<BenefitDto>>.Fail(NoToday))
            : Ok(ApiResponse<List<BenefitDto>>.Ok(await benefitsService.GetAllAsync(today)));

    /// <summary>GET …/summary?today= — usable value, lost this year, cashback this year and still to come.</summary>
    [HttpGet("summary")]
    public async Task<IActionResult> Summary([FromQuery] DateOnly today) =>
        today == default
            ? BadRequest(ApiResponse<RewardsSummaryDto>.Fail(NoToday))
            : Ok(ApiResponse<RewardsSummaryDto>.Ok(await benefitsService.SummaryAsync(today)));

    /// <summary>GET …/usable?store=&amp;today= — what can be used at a store (offered while recording a purchase).</summary>
    [HttpGet("usable")]
    public async Task<IActionResult> Usable([FromQuery] string? store, [FromQuery] DateOnly today) =>
        today == default
            ? BadRequest(ApiResponse<List<BenefitDto>>.Fail(NoToday))
            : Ok(ApiResponse<List<BenefitDto>>.Ok(await benefitsService.UsableAtAsync(store, today)));

    /// <summary>GET …/attention?today= — expiring within 30 days or cashback overdue (My Day).</summary>
    [HttpGet("attention")]
    public async Task<IActionResult> Attention([FromQuery] DateOnly today) =>
        today == default
            ? BadRequest(ApiResponse<List<BenefitDto>>.Fail(NoToday))
            : Ok(ApiResponse<List<BenefitDto>>.Ok(await benefitsService.AttentionAsync(today)));

    /// <summary>GET …/{id}?today= — with its code and PIN, uses and points batches.</summary>
    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id, [FromQuery] DateOnly today) =>
        today == default ? BadRequest(ApiResponse<BenefitDetailDto>.Fail(NoToday)) : Found(await benefitsService.GetAsync(id, today));

    /// <summary>POST — a reward; a voucher / gift card bought with "bought" is also a purchase with its expense.</summary>
    [HttpPost]
    public async Task<IActionResult> Create(BenefitRequest request) => Result(await benefitsService.CreateAsync(request));

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, BenefitRequest request) => Result(await benefitsService.UpdateAsync(id, request));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) => Found(await benefitsService.DeleteAsync(id));

    /// <summary>POST …/{id}/redemptions — used some (money, a coupon once, points; points can be cashed in to an account).</summary>
    [HttpPost("{id:int}/redemptions")]
    public async Task<IActionResult> Redeem(int id, RedemptionRequest request) => Result(await benefitsService.RedeemAsync(id, request));

    [HttpDelete("{id:int}/redemptions/{redemptionId:int}")]
    public async Task<IActionResult> RemoveRedemption(int id, int redemptionId, [FromQuery] DateOnly today) =>
        Result(await benefitsService.RemoveRedemptionAsync(id, redemptionId, today));

    /// <summary>POST …/{id}/points — points earned (each batch may expire).</summary>
    [HttpPost("{id:int}/points")]
    public async Task<IActionResult> AddPoints(int id, PointBatchRequest request) => Result(await benefitsService.AddPointsAsync(id, request));

    [HttpDelete("{id:int}/points/{batchId:int}")]
    public async Task<IActionResult> RemovePoints(int id, int batchId, [FromQuery] DateOnly today) =>
        Result(await benefitsService.RemovePointsAsync(id, batchId, today));

    /// <summary>PUT …/{id}/received — cashback arrived; with an account, one Finance income.</summary>
    [HttpPut("{id:int}/received")]
    public async Task<IActionResult> Received(int id, CashbackReceivedRequest request) =>
        Result(await benefitsService.MarkReceivedAsync(id, request));

    /// <summary>DELETE …/{id}/received?today= — not received after all (its income is deleted).</summary>
    [HttpDelete("{id:int}/received")]
    public async Task<IActionResult> UndoReceived(int id, [FromQuery] DateOnly today) =>
        Result(await benefitsService.UndoReceivedAsync(id, today));
}
