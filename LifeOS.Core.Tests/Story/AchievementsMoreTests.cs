using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Story.Services;

namespace LifeOS.Core.Tests.Story;

/// <summary>Session 96b: money, career, learning, leisure and tasks achievements.</summary>
public class AchievementsMoreTests
{
    private static readonly DateOnly Today = new(2026, 10, 16);

    private static DateOnly D(int month, int day) => new(2026, month, day);

    private static readonly ProgressFacts NoProgress = new([], [], [], [], [], [], [], [], []);

    private static MoneyFacts Money(
        string currency = "INR", decimal? inrRate = 1, IReadOnlyList<WealthDayFact>? days = null, IReadOnlyList<MoneyMonthFact>? months = null,
        IReadOnlyList<DebtFact>? debts = null, Dictionary<decimal, DateOnly>? crossed = null) =>
        new(currency, inrRate, days ?? [], months ?? [], debts ?? [], crossed ?? []);

    private static AchievementFacts Facts(ProgressFacts? progress = null, MoneyFacts? money = null) =>
        new(Today, 3, [], [], [], [], [], [], [], null, progress, money);

    private static Achievement Get(AchievementFacts facts, string key) => Achievements.Evaluate(facts).Single(a => a.Key == key);

    [Fact]
    public void Every_new_achievement_has_a_unique_key_and_its_module()
    {
        var all = Achievements.Evaluate(Facts(NoProgress, Money()));

        Assert.Equal(20 + 10 + 11, all.Count);
        Assert.Equal(all.Count, all.Select(a => a.Key).Distinct().Count());
        Assert.All(all.Skip(20), a => Assert.Contains(a.Module, new[] { ModuleKeys.Career, ModuleKeys.Learning, ModuleKeys.Leisure, ModuleKeys.Tasks, ModuleKeys.Finance }));
        Assert.All(all, a => Assert.Null(a.UnlockedOn));
    }

    [Fact]
    public void Inr_thresholds_read_in_lakh_and_crore()
    {
        var set = AchievementThresholds.For(AchievementThresholds.NetWorth, "INR", null)!;

        Assert.Equal(["₹10 lakh", "₹25 lakh", "₹50 lakh", "₹1 crore"], set.Select(t => t.Label));
        Assert.Equal([10_00_000m, 25_00_000m, 50_00_000m, 1_00_00_000m], set.Select(t => t.Amount));
    }

    [Fact]
    public void Another_base_currency_gets_rounded_milestones()
    {
        // 1 INR = 0.012 USD: ₹10 lakh ≈ $12,000 → $10,000; ₹25 lakh ≈ $30,000 → $25,000; ₹50 lakh ≈ $60,000 → $50,000;
        // ₹1 crore ≈ $120,000 → $100,000; ₹1 lakh ≈ $1,200 → $1,000; ₹2 lakh ≈ $2,400 → $2,500.
        var worth = AchievementThresholds.For(AchievementThresholds.NetWorth, "USD", 0.012m)!;
        var income = AchievementThresholds.For(AchievementThresholds.MonthIncome, "USD", 0.012m)!;

        Assert.Equal([10_000m, 25_000m, 50_000m, 100_000m], worth.Select(t => t.Amount));
        Assert.Equal("$10,000", worth[0].Label);
        Assert.Equal([1_000m, 2_500m], income.Select(t => t.Amount));
        Assert.Null(AchievementThresholds.For(AchievementThresholds.NetWorth, "USD", null));
    }

    [Theory]
    [InlineData(12_000, 10_000)]
    [InlineData(7_500, 10_000)]
    [InlineData(6_000, 5_000)]
    [InlineData(2_300, 2_500)]
    [InlineData(1_600, 2_000)]
    [InlineData(1_000, 1_000)]
    public void Milestones_are_1_2_25_or_5_times_a_power_of_ten(decimal amount, decimal expected) =>
        Assert.Equal(expected, AchievementThresholds.Milestone(amount));

    [Fact]
    public void Net_worth_unlocks_on_the_first_day_it_reached_the_threshold_and_a_dip_keeps_it()
    {
        var days = new[]
        {
            new WealthDayFact(D(9, 1), 9_80_000m, 0), new WealthDayFact(D(9, 2), 10_05_000m, 0), new WealthDayFact(D(10, 16), 9_90_000m, 0),
        };
        var facts = Facts(money: Money(days: days));

        var ten = Get(facts, "net-worth-10-lakh");
        Assert.Equal(D(9, 2), ten.UnlockedOn);
        Assert.Equal(ten.Target, ten.Progress);
        Assert.Equal("Net worth ₹10 lakh", ten.Title);
        Assert.Equal("INR", ten.Currency);
        var next = Get(facts, "net-worth-25-lakh");
        Assert.Null(next.UnlockedOn);
        Assert.Equal(9_90_000, next.Progress);
    }

    [Fact]
    public void Without_an_inr_rate_the_thresholds_ask_for_one_instead_of_guessing()
    {
        var facts = Facts(money: Money("USD", null, days: [new WealthDayFact(D(10, 16), 1_000_000m, 0)]));

        var worth = Get(facts, "net-worth-10-lakh");
        Assert.True(worth.NeedsRate);
        Assert.Null(worth.UnlockedOn);
        Assert.True(Get(facts, "earned-1-lakh-month").NeedsRate);
        Assert.False(Get(facts, "debt-free").NeedsRate);
    }

    [Fact]
    public void A_month_of_income_unlocks_on_the_day_it_crossed()
    {
        var months = new[] { new MoneyMonthFact(D(9, 1), 90_000m, 40_000m), new MoneyMonthFact(D(10, 1), 1_05_000m, 30_000m) };
        var facts = Facts(money: Money(months: months, crossed: new() { [1_00_000m] = D(10, 12) }));

        Assert.Equal(D(10, 12), Get(facts, "earned-1-lakh-month").UnlockedOn);
        var two = Get(facts, "earned-2-lakh-month");
        Assert.Null(two.UnlockedOn);
        Assert.Equal(1_05_000, two.Progress);
        Assert.Equal("A ₹2 lakh month", two.Title);
    }

    [Fact]
    public void Budgets_kept_count_finished_months_and_a_month_without_budgets_breaks_the_run()
    {
        MoneyMonthFact M(int month, bool? kept) => new(D(month, 1), 0, 0, kept);

        var running = Facts(money: Money(months: [M(6, true), M(7, true), M(8, true), M(9, false), M(10, true)]));
        Assert.Equal(D(6, 30), Get(running, "budget-month").UnlockedOn);
        Assert.Equal(D(8, 31), Get(running, "budget-3-months").UnlockedOn);

        // July had no budget at all; October isn't over yet.
        var gap = Facts(money: Money(months: [M(6, true), M(7, null), M(8, true), M(9, true), M(10, true)]));
        var three = Get(gap, "budget-3-months");
        Assert.Null(three.UnlockedOn);
        Assert.Equal(2, three.Progress);
    }

    [Fact]
    public void Saving_twenty_percent_three_months_running()
    {
        MoneyMonthFact M(int month, decimal spending) => new(D(month, 1), 1_00_000m, spending);

        Assert.Equal(D(9, 30), Get(Facts(money: Money(months: [M(7, 80_000m), M(8, 75_000m), M(9, 50_000m)])), "saved-20-3-months").UnlockedOn);
        var broken = Get(Facts(money: Money(months: [M(7, 80_000m), M(8, 80_100m), M(9, 50_000m)])), "saved-20-3-months");
        Assert.Null(broken.UnlockedOn);
        Assert.Equal(1, broken.Progress);
    }

    [Fact]
    public void Emergency_fund_is_six_months_of_average_spending_in_accounts_at_a_month_end()
    {
        var months = Enumerable.Range(4, 6).Select(m => new MoneyMonthFact(D(m, 1), 50_000m, 10_000m)).ToList();

        var enough = Facts(money: Money(months: months, days: [new WealthDayFact(D(9, 30), 0, 60_000m), new WealthDayFact(D(10, 16), 0, 61_000m)]));
        Assert.Equal(D(9, 30), Get(enough, "emergency-fund").UnlockedOn);

        var short_ = Get(Facts(money: Money(months: months, days: [new WealthDayFact(D(9, 30), 0, 59_999m), new WealthDayFact(D(10, 16), 0, 55_000m)])),
            "emergency-fund");
        Assert.Null(short_.UnlockedOn);
        Assert.Equal(5, short_.Progress);
        Assert.Equal(6, short_.Target);
    }

    [Fact]
    public void Debt_free_once_every_borrowed_loan_is_cleared()
    {
        Assert.Null(Get(Facts(money: Money()), "debt-free").UnlockedOn);

        var oneLeft = Get(Facts(money: Money(debts: [new DebtFact(0, D(3, 5)), new DebtFact(25_000m, null)])), "debt-free");
        Assert.Null(oneLeft.UnlockedOn);
        Assert.Equal(1, oneLeft.Progress);
        Assert.Equal(2, oneLeft.Target);

        Assert.Equal(D(8, 10), Get(Facts(money: Money(debts: [new DebtFact(0, D(3, 5)), new DebtFact(0, D(8, 10))])), "debt-free").UnlockedOn);
    }

    [Fact]
    public void Learning_leisure_tasks_and_career_count_on_their_days()
    {
        var study = Enumerable.Range(0, 101).Select(i => new MinutesFact(D(5, 1).AddDays(i), 60)).ToList();
        var books2025 = Enumerable.Range(1, 11).Select(m => new MediaFinishedFact("Book", new DateOnly(2025, m, 10))).ToList();
        var books2026 = Enumerable.Range(1, 12).Select(i => new MediaFinishedFact("Book", D(1, 1).AddDays(i * 20))).ToList();
        var tasks = Enumerable.Range(0, 100).Select(i => D(6, 1).AddDays(i)).ToList();
        var progress = NoProgress with
        {
            Promotions = [D(4, 1)],
            Study = study,
            SkillsAtTop = [D(9, 9)],
            MediaFinished = [.. books2025, .. books2026],
            TasksDone = tasks,
            Focus = [new MinutesFact(D(10, 1), 600), new MinutesFact(D(10, 2), 600)],
        };
        var facts = Facts(progress);

        Assert.Equal(D(4, 1), Get(facts, "first-promotion").UnlockedOn);
        Assert.Equal(D(5, 1).AddDays(99), Get(facts, "study-100-hours").UnlockedOn);
        Assert.Equal(D(9, 9), Get(facts, "skill-top").UnlockedOn);
        Assert.Equal(D(1, 1).AddDays(240), Get(facts, "books-12-year").UnlockedOn);
        Assert.Null(Get(facts, "media-50").UnlockedOn);
        Assert.Equal(23, Get(facts, "media-50").Progress);
        Assert.Equal(D(6, 1).AddDays(99), Get(facts, "tasks-100").UnlockedOn);
        var focus = Get(facts, "focus-50-hours");
        Assert.Null(focus.UnlockedOn);
        Assert.Equal(20, focus.Progress);
    }

    [Fact]
    public async Task The_crossing_day_is_the_first_day_the_running_total_reaches_the_amount()
    {
        // Salary 80,000 on the 1st, side income 25,000 on the 18th: ₹1 lakh is crossed on the 18th.
        decimal Through(DateOnly day) => (day >= D(10, 1) ? 80_000m : 0) + (day >= D(10, 18) ? 25_000m : 0);
        var calls = 0;

        var on = await AchievementsService.FirstDayReachingAsync(D(10, 1), D(10, 31), 1_00_000m, day =>
        {
            calls++;
            return Task.FromResult(Through(day));
        });

        Assert.Equal(D(10, 18), on);
        Assert.True(calls <= 6);
    }
}
