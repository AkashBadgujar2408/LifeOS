using LifeOS.Core.Home.Services;

namespace LifeOS.Core.Tests.Home;

public class FuelEconomyTests
{
    private static readonly DateOnly Today = new(2026, 10, 20);

    private static FuelFill Fill(int id, int day, int odometer, decimal amount, decimal rate, bool missed = false) =>
        new(id, Today.AddDays(day), odometer, amount, "INR", FuelEconomy.Quantity(amount, rate, null), missed);

    [Fact]
    public void Your_example_two_fills_of_500_rupees_300_km_apart_at_104_a_litre_is_62_4_km_per_litre()
    {
        var fills = new[] { Fill(1, -10, 5000, 500, 104), Fill(2, 0, 5300, 500, 104) };

        var average = FuelEconomy.Average(fills)!;

        // 300 km ÷ 4.8077 L (the first fill's fuel; the latest is still in the tank).
        Assert.Equal(62.4m, Math.Round(average.PerUnit, 1));
        Assert.Equal(300, average.DistanceKm);
        Assert.Equal(2, average.Fills);
        Assert.Equal(1.67m, Math.Round(average.CostPerKm!.Value, 2));
        Assert.Equal("INR", average.Currency);
    }

    [Fact]
    public void One_fill_has_no_average_and_the_order_is_by_day_then_odometer()
    {
        Assert.Null(FuelEconomy.Average([Fill(1, 0, 5000, 500, 104)]));

        // Entered out of order: still 5,000 → 5,300.
        var average = FuelEconomy.Average([Fill(2, 0, 5300, 500, 104), Fill(1, -10, 5000, 500, 104)])!;
        Assert.Equal(300, average.DistanceKm);
    }

    [Fact]
    public void A_missed_fill_starts_a_new_run_so_it_never_inflates_the_average()
    {
        var fills = new[]
        {
            Fill(1, -30, 1000, 1000, 100),               // 10 L
            Fill(2, -20, 1500, 1000, 100),               // 10 L, 500 km on the first 10 L → 50 km/L
            // A fill between these was never logged — counting 1,500 → 2,600 on 10 L would say 110 km/L.
            Fill(3, -10, 2600, 1000, 100, missed: true),
            Fill(4, 0, 3100, 1000, 100),
        };

        var average = FuelEconomy.Average(fills)!;

        Assert.Equal(50m, average.PerUnit);
        Assert.Equal(500, average.DistanceKm);
        Assert.Equal(2, average.Fills);
        // The trend shows what each run said: after fill 2, and again after fill 4 (fill 3 alone has none).
        Assert.Equal([2, 4], FuelEconomy.Trend(fills).Select(p => p.FillId));
        Assert.Null(FuelEconomy.Average(fills.Take(3)));
    }

    [Fact]
    public void The_tank_level_error_shrinks_as_fills_add_up()
    {
        // A bike that truly does 50 km/L, filled partially whenever it's low; the level it's filled at varies.
        const decimal TrueKmPerLitre = 50;
        decimal[] fills = [3, 4.5m, 2, 5, 3.5m, 4, 2.5m, 5, 3, 4, 4.5m, 3];
        decimal[] leftWhenFilling = [1.4m, 0.3m, 1.1m, 0.5m, 1.2m, 0.2m, 0.9m, 0.4m, 1.3m, 0.6m, 0.8m, 0.5m];
        var logged = new List<FuelFill>();
        var tank = leftWhenFilling[0];
        decimal odometer = 10_000;
        for (var i = 0; i < fills.Length; i++)
        {
            odometer += (tank - leftWhenFilling[i]) * TrueKmPerLitre;
            tank = leftWhenFilling[i] + fills[i];
            logged.Add(new FuelFill(i + 1, Today.AddDays(i), (int)odometer, fills[i] * 100, "INR", fills[i], false));
        }

        decimal ErrorAfter(int count) => Math.Abs(FuelEconomy.Average(logged.Take(count))!.PerUnit - TrueKmPerLitre);

        Assert.True(ErrorAfter(3) > ErrorAfter(12));
        Assert.True(ErrorAfter(12) < 2.5m); // within 5% after a dozen fills
    }

    [Fact]
    public void Quantity_or_rate_is_worked_out_from_the_other()
    {
        Assert.Equal(5m, FuelEconomy.Quantity(520, 104, null));
        Assert.Equal(4m, FuelEconomy.Quantity(520, null, 4));
        Assert.Equal(130m, FuelEconomy.PricePerUnit(520, null, 4));
        Assert.Equal(104m, FuelEconomy.PricePerUnit(520, 104, null));
    }

    [Fact]
    public void Cost_per_km_needs_one_currency_and_months_add_up_per_currency()
    {
        var fills = new[]
        {
            new FuelFill(1, new DateOnly(2026, 9, 28), 1000, 1000, "INR", 10, false),
            new FuelFill(2, new DateOnly(2026, 10, 2), 1500, 50, "EUR", 25, false),
            new FuelFill(3, new DateOnly(2026, 10, 9), 2000, 1000, "INR", 10, false),
        };

        var average = FuelEconomy.Average(fills)!;
        Assert.Null(average.CostPerKm);
        Assert.Null(average.Currency);
        Assert.Equal(1000 / 35m, average.PerUnit);

        Assert.Equal(
            [
                new FuelMonth(new DateOnly(2026, 10, 1), "EUR", 50),
                new FuelMonth(new DateOnly(2026, 10, 1), "INR", 1000),
                new FuelMonth(new DateOnly(2026, 9, 1), "INR", 1000),
            ],
            FuelEconomy.Monthly(fills));
    }

    [Fact]
    public void A_fill_needs_the_rate_or_the_quantity_and_the_odometer_only_goes_up()
    {
        Assert.Null(FuelEconomy.CheckFill(Today, 5300, 500, "INR", 104, null, Today));
        Assert.Null(FuelEconomy.CheckFill(Today, 5300, 500, "INR", null, 4.8m, Today));
        Assert.NotNull(FuelEconomy.CheckFill(Today, 5300, 500, "INR", 104, 4.8m, Today));
        Assert.NotNull(FuelEconomy.CheckFill(Today, 5300, 500, "INR", null, null, Today));
        Assert.NotNull(FuelEconomy.CheckFill(Today.AddDays(1), 5300, 500, "INR", 104, null, Today));
        Assert.NotNull(FuelEconomy.CheckFill(Today, 5300, 0, "INR", 104, null, Today));
        Assert.NotNull(FuelEconomy.CheckFill(Today, -1, 500, "INR", 104, null, Today));

        var others = new[] { (Today.AddDays(-10), 5000), (Today.AddDays(10), 5600) };
        Assert.Null(FuelEconomy.CheckOdometer(Today, 5300, others));
        Assert.NotNull(FuelEconomy.CheckOdometer(Today, 4900, others));   // lower than an earlier fill
        Assert.NotNull(FuelEconomy.CheckOdometer(Today, 5000, others));   // the same as an earlier fill
        Assert.NotNull(FuelEconomy.CheckOdometer(Today, 5700, others));   // higher than a later fill
        Assert.Null(FuelEconomy.CheckOdometer(Today, 5300, [(Today, 5250)])); // two fills one day
        Assert.NotNull(FuelEconomy.CheckOdometer(Today, 5250, [(Today, 5250)]));
    }
}
