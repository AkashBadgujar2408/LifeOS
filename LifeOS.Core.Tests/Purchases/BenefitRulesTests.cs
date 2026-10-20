using LifeOS.Core.Purchases.Services;

namespace LifeOS.Core.Tests.Purchases;

public class BenefitRulesTests
{
    private static readonly DateOnly Today = new(2026, 10, 20);

    private static BenefitState Money(decimal value, DateOnly? expires, params decimal[] used) =>
        BenefitRules.State(BenefitKinds.Voucher, value, null, expires, null, null,
            used.Select((a, i) => new BenefitUse(i + 1, Today.AddDays(-5), a, null)).ToList(), [], Today);

    [Fact]
    public void A_500_voucher_used_for_300_has_200_left_and_cant_take_more()
    {
        var state = Money(500, Today.AddDays(90), 300);
        Assert.Equal(BenefitStatuses.Usable, state.Status);
        Assert.Equal(200m, state.Balance);

        var uses = new[] { new BenefitUse(1, Today.AddDays(-5), 300, null) };
        Assert.NotNull(BenefitRules.CheckUse(BenefitKinds.Voucher, 500, null, Today, 250, null, uses, [], Today));
        Assert.Null(BenefitRules.CheckUse(BenefitKinds.Voucher, 500, null, Today, 200, null, uses, [], Today));
        Assert.Equal(BenefitStatuses.UsedUp, Money(500, null, 300, 200).Status);
    }

    [Fact]
    public void An_expired_voucher_is_no_longer_usable_and_counts_as_lost()
    {
        var state = Money(500, Today.AddDays(-1), 300);
        Assert.Equal(BenefitStatuses.Expired, state.Status);
        Assert.Equal(200m, state.Lost);
        Assert.Equal(Today.AddDays(-1), state.LostOn);
        Assert.NotNull(BenefitRules.CheckUse(BenefitKinds.Voucher, 500, Today.AddDays(-1), Today, 50, null, [], [], Today));
        // Used before it ran out: fine.
        Assert.Null(BenefitRules.CheckUse(BenefitKinds.Voucher, 500, Today.AddDays(-1), Today.AddDays(-2), 50, null, [], [], Today));

        Assert.True(Money(500, Today.AddDays(30)).ExpiringSoon);
        Assert.False(Money(500, Today.AddDays(31)).ExpiringSoon);
        Assert.Equal(0m, Money(500, Today.AddDays(-1), 500).Lost); // used up before it ran out: nothing lost
    }

    [Fact]
    public void A_coupon_is_used_once_and_saves_its_share_of_the_bill()
    {
        var used = new[] { new BenefitUse(1, Today, 100, null) };
        Assert.NotNull(BenefitRules.CheckUse(BenefitKinds.Coupon, null, null, Today, 100, null, used, [], Today));
        Assert.Equal(BenefitStatuses.UsedUp,
            BenefitRules.State(BenefitKinds.Coupon, null, null, null, null, null, used, [], Today).Status);

        Assert.Equal(250m, BenefitRules.CouponSaving(null, 10, 1000, 2500));
        Assert.Equal(0m, BenefitRules.CouponSaving(null, 10, 1000, 900)); // below the minimum spend
        Assert.Equal(150m, BenefitRules.CouponSaving(200, null, null, 150)); // never more than the bill
    }

    [Fact]
    public void Points_are_spent_from_the_batch_running_out_soonest_and_expired_ones_are_lost()
    {
        var batches = new[]
        {
            new PointBatchFacts(1, new DateOnly(2026, 1, 1), 1000, new DateOnly(2026, 12, 31)),
            new PointBatchFacts(2, new DateOnly(2026, 3, 1), 500, new DateOnly(2026, 6, 30)),
            new PointBatchFacts(3, new DateOnly(2026, 9, 1), 300, null),
        };
        // 400 used in May: from batch 2 (runs out first) — 100 of it left, which then expires in June.
        var uses = new[] { new BenefitUse(1, new DateOnly(2026, 5, 10), null, 400) };

        var state = BenefitRules.State(BenefitKinds.Points, null, 0.5m, null, null, null, uses, batches, Today);
        Assert.Equal(1300, state.PointsAvailable);
        Assert.Equal(650m, state.PointsValue);
        Assert.Equal(50m, state.Lost); // 100 points × 0.5
        Assert.Equal(100, state.BatchRemaining[2]);
        Assert.Equal(new DateOnly(2026, 12, 31), state.NextExpiry);

        Assert.NotNull(BenefitRules.CheckUse(BenefitKinds.Points, null, null, Today, null, 1301, uses, batches, Today));
        Assert.Null(BenefitRules.CheckUse(BenefitKinds.Points, null, null, Today, null, 1300, uses, batches, Today));
    }

    [Fact]
    public void Cashback_is_pending_until_received_and_overdue_after_its_day()
    {
        var pending = BenefitRules.State(BenefitKinds.Cashback, 150, null, null, null, Today.AddDays(-1), [], [], Today);
        Assert.Equal(BenefitStatuses.Pending, pending.Status);
        Assert.True(pending.Overdue);
        Assert.False(BenefitRules.State(BenefitKinds.Cashback, 150, null, null, null, Today, [], [], Today).Overdue);
        Assert.Equal(BenefitStatuses.Received,
            BenefitRules.State(BenefitKinds.Cashback, 150, null, null, Today, Today.AddDays(-1), [], [], Today).Status);
        Assert.NotNull(BenefitRules.CheckUse(BenefitKinds.Cashback, 150, null, Today, 10, null, [], [], Today));
    }

    [Fact]
    public void Each_kind_needs_its_own_fields()
    {
        string? Check(string kind, string? store = null, decimal? value = null, string? currency = null, decimal? percent = null,
            decimal? perPoint = null, int? account = null) =>
            BenefitRules.Check(kind, "x", store, value, currency, percent, null, perPoint, account, null, null, null);

        Assert.Null(Check("Voucher", value: 500, currency: "INR"));
        Assert.NotNull(Check("Voucher"));
        Assert.Null(Check("Coupon", percent: 10));
        Assert.NotNull(Check("Coupon", value: 100, currency: "INR", percent: 10));
        Assert.NotNull(Check("Points", perPoint: 0.5m, currency: "INR")); // no programme
        Assert.Null(Check("Points", store: "Flying Returns", perPoint: 0.5m, currency: "INR"));
        Assert.NotNull(Check("WalletCredit", value: 100, currency: "INR"));
        Assert.Null(Check("WalletCredit", value: 100, currency: "INR", account: 7));
        Assert.NotNull(Check("Lottery"));
    }
}
