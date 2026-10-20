using LifeOS.Core.Finance.Services;

namespace LifeOS.Core.Purchases.Services;

/// <summary>Matches CK_Benefits_Kind.</summary>
public static class BenefitKinds
{
    public const string Voucher = "Voucher";
    public const string GiftCard = "GiftCard";
    public const string StoreCredit = "StoreCredit";
    public const string Coupon = "Coupon";
    public const string Cashback = "Cashback";
    public const string Points = "Points";
    public const string WalletCredit = "WalletCredit";

    public static readonly IReadOnlySet<string> All =
        new HashSet<string>([Voucher, GiftCard, StoreCredit, Coupon, Cashback, Points, WalletCredit], StringComparer.Ordinal);

    /// <summary>Money held at a store or in a wallet, used up by redemptions.</summary>
    public static readonly IReadOnlySet<string> Money =
        new HashSet<string>([Voucher, GiftCard, StoreCredit, WalletCredit], StringComparer.Ordinal);
}

/// <summary>Where a benefit stands (computed).</summary>
public static class BenefitStatuses
{
    public const string Usable = "Usable";
    public const string UsedUp = "UsedUp";
    public const string Expired = "Expired";
    /// <summary>Cashback not received yet.</summary>
    public const string Pending = "Pending";
    public const string Received = "Received";
}

public sealed record BenefitUse(int Id, DateOnly Day, decimal? Amount, int? Points);

public sealed record PointBatchFacts(int Id, DateOnly EarnedOn, int Points, DateOnly? ExpiresOn);

/// <summary>A benefit worked out on a day — never stored.</summary>
public sealed record BenefitState(
    string Status,
    decimal? Balance,
    int? PointsAvailable,
    decimal? PointsValue,
    /// <summary>Money (or points' value) that ran out unused, and the day it did.</summary>
    decimal Lost,
    DateOnly? LostOn,
    bool ExpiringSoon,
    bool Overdue,
    /// <summary>Points left in each batch, by batch id.</summary>
    IReadOnlyDictionary<int, int> BatchRemaining,
    /// <summary>The next day something runs out with value left (for the reminder).</summary>
    DateOnly? NextExpiry);

/// <summary>
/// Rewards & vouchers (Session 70a), mirroring CK_Benefits_* and adding what a CHECK can't see across rows: a money
/// benefit's balance is its value minus what's been used (never below zero); a coupon is used once; points are spent
/// from the batch running out soonest; anything past its expiry is lost — counted, never usable. Pure and unit-tested.
/// </summary>
public static class BenefitRules
{
    /// <summary>"Expiring soon" (My Day, the rewards page): within 30 days.</summary>
    public const int SoonDays = 30;

    public static string? Check(
        string kind, string name, string? store, decimal? value, string? currency, decimal? discountPercent, decimal? minSpend,
        decimal? valuePerPoint, int? accountId, DateOnly? expectedBy, int? reminderDays, DateOnly? expiresOn) =>
        !BenefitKinds.All.Contains(kind) ? "Choose what kind of reward it is."
        : name.Trim().Length == 0 ? "Name it (e.g. Amazon gift card)."
        : value is <= 0 || value > FinanceRules.MaxAmount ? "The value has to be more than zero."
        : minSpend is <= 0 || minSpend > FinanceRules.MaxAmount ? "The minimum spend has to be more than zero."
        : (value is not null || minSpend is not null) && currency is null ? "Choose the currency."
        : reminderDays is < 0 or > 365 ? "Remind 0 to 365 days before."
        : reminderDays is not null && expiresOn is null && kind != BenefitKinds.Points ? "Reminders need an expiry day."
        : expectedBy is not null && kind != BenefitKinds.Cashback ? "Only cashback has an expected day."
        : kind switch
        {
            BenefitKinds.Voucher or BenefitKinds.GiftCard or BenefitKinds.StoreCredit or BenefitKinds.Cashback =>
                value is null ? "Give its value." : discountPercent is not null || valuePerPoint is not null ? "Only a coupon has a % off; only points have a point value." : null,
            BenefitKinds.Coupon =>
                (value is null) == (discountPercent is null) ? "A coupon is a % off or a flat amount off — one of the two."
                : discountPercent is <= 0 or > 100 ? "The % off is between 0 and 100."
                : valuePerPoint is not null ? "Only points have a point value." : null,
            BenefitKinds.Points =>
                store is null ? "Name the programme (e.g. Air India Flying Returns)."
                : valuePerPoint is not > 0 ? "Give what one point is worth."
                : currency is null ? "Choose the currency a point is worth."
                : value is not null || discountPercent is not null ? "Points have a point value, not a value." : null,
            BenefitKinds.WalletCredit =>
                value is null ? "Give its value." : accountId is null ? "Choose the wallet it's in." : null,
            _ => null,
        };

    public static BenefitState State(
        string kind, decimal? value, decimal? valuePerPoint, DateOnly? expiresOn, DateOnly? receivedOn, DateOnly? expectedBy,
        IReadOnlyCollection<BenefitUse> uses, IReadOnlyCollection<PointBatchFacts> batches, DateOnly today)
    {
        var expired = expiresOn is { } e && e < today;
        var soon = expiresOn is { } s && s >= today && s <= today.AddDays(SoonDays);
        var none = new Dictionary<int, int>();

        if (kind == BenefitKinds.Cashback)
        {
            return receivedOn is not null
                ? new BenefitState(BenefitStatuses.Received, value, null, null, 0, null, false, false, none, null)
                : new BenefitState(BenefitStatuses.Pending, value, null, null, 0, null, false, expectedBy is { } by && by < today, none, null);
        }

        if (kind == BenefitKinds.Coupon)
        {
            var status = uses.Count > 0 ? BenefitStatuses.UsedUp : expired ? BenefitStatuses.Expired : BenefitStatuses.Usable;
            return new BenefitState(status, value, null, null, 0, null, status == BenefitStatuses.Usable && soon, false, none,
                status == BenefitStatuses.Usable ? expiresOn : null);
        }

        if (kind == BenefitKinds.Points)
        {
            var remaining = PointsLeft(uses, batches);
            var available = batches.Where(b => b.EarnedOn <= today && (b.ExpiresOn is null || b.ExpiresOn >= today)).Sum(b => remaining[b.Id]);
            var lostBatches = batches.Where(b => b.ExpiresOn is { } x && x < today && remaining[b.Id] > 0).ToList();
            var lostPoints = lostBatches.Sum(b => remaining[b.Id]);
            var next = batches.Where(b => b.ExpiresOn is { } x && x >= today && remaining[b.Id] > 0).Min(b => b.ExpiresOn);
            var perPoint = valuePerPoint ?? 0;
            return new BenefitState(
                available > 0 || batches.Count == 0 ? BenefitStatuses.Usable : lostPoints > 0 ? BenefitStatuses.Expired : BenefitStatuses.UsedUp,
                null, available, Math.Round(available * perPoint, 2), Math.Round(lostPoints * perPoint, 2),
                lostBatches.Count > 0 ? lostBatches.Max(b => b.ExpiresOn) : null,
                next is { } n && n <= today.AddDays(SoonDays), false, remaining, next);
        }

        // Money: voucher, gift card, store credit, wallet credit.
        var balance = Math.Max(0, (value ?? 0) - uses.Sum(u => u.Amount ?? 0));
        var state = balance == 0 ? BenefitStatuses.UsedUp : expired ? BenefitStatuses.Expired : BenefitStatuses.Usable;
        return new BenefitState(state, balance, null, null, state == BenefitStatuses.Expired ? balance : 0,
            state == BenefitStatuses.Expired ? expiresOn : null, state == BenefitStatuses.Usable && soon, false, none,
            state == BenefitStatuses.Usable ? expiresOn : null);
    }

    /// <summary>
    /// Can this be used now? Money: an amount up to the balance, before it runs out. Coupon: once, before it runs out.
    /// Points: up to what's valid that day. Cashback is received, not used.
    /// </summary>
    public static string? CheckUse(
        string kind, decimal? value, DateOnly? expiresOn, DateOnly day, decimal? amount, int? points,
        IReadOnlyCollection<BenefitUse> uses, IReadOnlyCollection<PointBatchFacts> batches, DateOnly today)
    {
        if (day == default)
        {
            return "Say when it was used.";
        }

        if (day > today)
        {
            return "It can't be used in the future.";
        }

        if (kind == BenefitKinds.Cashback)
        {
            return "Cashback is received, not used — mark it received.";
        }

        if ((amount is null) == (points is null))
        {
            return kind == BenefitKinds.Points ? "Say how many points." : "Say how much was used.";
        }

        if (kind == BenefitKinds.Points)
        {
            if (points is not > 0)
            {
                return "Say how many points.";
            }

            var remaining = PointsLeft(uses, batches);
            var valid = batches.Where(b => b.EarnedOn <= day && (b.ExpiresOn is null || b.ExpiresOn >= day)).Sum(b => remaining[b.Id]);
            return points > valid ? FormattableString.Invariant($"Only {valid:N0} points can be used that day.") : null;
        }

        if (amount is not > 0 || amount > FinanceRules.MaxAmount)
        {
            return "The amount has to be more than zero.";
        }

        if (expiresOn is { } e && day > e)
        {
            return "It had run out by then.";
        }

        if (kind == BenefitKinds.Coupon)
        {
            return uses.Count > 0 ? "This coupon has been used already — a coupon is used once." : null;
        }

        var balance = (value ?? 0) - uses.Sum(u => u.Amount ?? 0);
        return amount > balance ? FormattableString.Invariant($"Only {balance:0.##} is left on it.") : null;
    }

    /// <summary>
    /// What a coupon saves on a bill: its % of the bill (or its flat amount), nothing below the minimum spend, never
    /// more than the bill.
    /// </summary>
    public static decimal CouponSaving(decimal? flat, decimal? percent, decimal? minSpend, decimal bill) =>
        bill <= 0 || (minSpend is { } m && bill < m) ? 0
        : Math.Min(bill, flat ?? Math.Round(bill * (percent ?? 0) / 100m, 2, MidpointRounding.AwayFromZero));

    /// <summary>Points left in each batch after every use, spending the batch that runs out soonest first.</summary>
    internal static Dictionary<int, int> PointsLeft(IReadOnlyCollection<BenefitUse> uses, IReadOnlyCollection<PointBatchFacts> batches)
    {
        var remaining = batches.ToDictionary(b => b.Id, b => b.Points);
        foreach (var use in uses.Where(u => u.Points is > 0).OrderBy(u => u.Day).ThenBy(u => u.Id))
        {
            var left = use.Points!.Value;
            foreach (var batch in batches
                         .Where(b => b.EarnedOn <= use.Day && (b.ExpiresOn is null || b.ExpiresOn >= use.Day))
                         .OrderBy(b => b.ExpiresOn ?? DateOnly.MaxValue).ThenBy(b => b.EarnedOn).ThenBy(b => b.Id))
            {
                var take = Math.Min(left, remaining[batch.Id]);
                remaining[batch.Id] -= take;
                left -= take;
                if (left == 0)
                {
                    break;
                }
            }
        }

        return remaining;
    }
}
