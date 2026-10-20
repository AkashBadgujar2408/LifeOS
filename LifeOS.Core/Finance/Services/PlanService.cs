using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Finance.Services;

/// <summary>
/// Savings and retirement projections (Session 71b). The assumptions are one row per user (rewritten in place; defaults
/// until saved); every figure is <see cref="FinancialPlan"/> over today's data — never stored:
/// <list type="bullet">
/// <item>each savings goal (an amount target, Session 58) with what's linked to it now and three months ago
/// (<see cref="IWealthService.GetSavingsAsync"/>), paced against its target date;</item>
/// <item>retirement from the investments held today (net worth's holdings, in the base currency) and the monthly
/// saving — typed, else income − spending averaged over the last three full months (the cash-flow report).</item>
/// </list>
/// The age comes from Health's date of birth when there is one, else the one typed here.
/// </summary>
public class PlanService(AppDbContext db, IWealthService wealthService, IFinanceReportsService reportsService) : IPlanService
{
    private const decimal DefaultReturn = 10;
    private const decimal DefaultInflation = 6;
    private const int DefaultRetirementAge = 60;
    private const int DefaultYearsInRetirement = 25;

    public async Task<FinancialPlanDto> GetAsync(DateOnly today)
    {
        var row = await db.PlanAssumptions.FirstOrDefaultAsync();
        var assumptions = new PlanAssumptionsDto
        {
            ExpectedReturnPercent = row?.ExpectedReturnPercent ?? DefaultReturn,
            InflationPercent = row?.InflationPercent ?? DefaultInflation,
            BirthDate = row?.BirthDate,
            RetirementAge = row?.RetirementAge ?? DefaultRetirementAge,
            YearsInRetirement = row?.YearsInRetirement ?? DefaultYearsInRetirement,
            MonthlySpending = row?.MonthlySpending,
            MonthlySaving = row?.MonthlySaving,
            IsSaved = row is not null,
        };

        var healthBirth = await db.HealthProfiles.Select(h => h.DateOfBirth).FirstOrDefaultAsync();
        var birth = healthBirth ?? assumptions.BirthDate;
        int? age = birth is { } b ? FinancialPlan.Age(b, today) : null;

        var baseCurrency = await db.Users.Where(u => u.Id == db.CurrentUserId).Select(u => u.BaseCurrency).FirstOrDefaultAsync();
        decimal investments = 0;
        decimal? actualSaving = null;
        if (baseCurrency is not null)
        {
            var worth = await wealthService.GetNetWorthAsync(today);
            investments = worth.Items.Where(i => i.Type == NetWorth.HoldingType).Sum(i => i.InBase ?? 0);
            // The last three full months (today's month is still going).
            var report = await reportsService.GetCashFlowAsync(today, 4);
            var full = report.Months.Where(m => m.MonthStart < new DateOnly(today.Year, today.Month, 1)).TakeLast(3).ToList();
            actualSaving = full.Count == 0 ? 0 : Math.Round(full.Average(m => m.Net), 2, MidpointRounding.AwayFromZero);
        }

        var saving = Math.Max(0, assumptions.MonthlySaving ?? actualSaving ?? 0);
        var goals = new List<SavingsGoalPlanDto>();
        foreach (var goal in await db.Goals
                     .Where(g => g.TargetAmount != null && g.TargetCurrency != null && (g.Status == "Active" || g.Status == "Postponed"))
                     .OrderBy(g => g.TargetDate == null).ThenBy(g => g.TargetDate).ThenBy(g => g.Title)
                     .Select(g => new { g.Id, g.Title, g.TargetDate })
                     .ToListAsync())
        {
            var now = (await wealthService.GetSavingsAsync(goal.Id, today)).Data;
            if (now is null)
            {
                continue;
            }

            var then = (await wealthService.GetSavingsAsync(goal.Id, today.AddMonths(-3))).Data;
            var plan = FinancialPlan.Savings(now.TargetAmount, now.Saved, then?.Saved ?? 0, goal.TargetDate, today, assumptions.ExpectedReturnPercent);
            goals.Add(new SavingsGoalPlanDto
            {
                GoalId = goal.Id,
                Title = goal.Title,
                TargetAmount = now.TargetAmount,
                Currency = now.TargetCurrency,
                Saved = now.Saved,
                Percent = now.Percent,
                TargetDate = goal.TargetDate,
                MonthsLeft = plan.MonthsLeft,
                NeededPerMonth = plan.NeededPerMonth,
                ActualPerMonth = plan.ActualPerMonth,
                Status = plan.Status,
            });
        }

        var missing = new List<string>();
        if (baseCurrency is null)
        {
            missing.Add("a base currency (Settings)");
        }

        if (age is null)
        {
            missing.Add("your date of birth");
        }

        if (assumptions.MonthlySpending is null)
        {
            missing.Add("what you'd spend a month in retirement");
        }

        RetirementProjectionDto? retirement = null;
        if (missing.Count == 0)
        {
            var r = FinancialPlan.Retirement(age!.Value, assumptions.RetirementAge, assumptions.YearsInRetirement, assumptions.MonthlySpending!.Value,
                investments, saving, assumptions.ExpectedReturnPercent, assumptions.InflationPercent);
            retirement = new RetirementProjectionDto
            {
                YearsToRetirement = r.YearsToRetirement,
                MonthlySpendingAtRetirement = r.MonthlySpendingAtRetirement,
                CorpusNeeded = r.CorpusNeeded,
                RuleOf25 = r.RuleOf25,
                ProjectedCorpus = r.ProjectedCorpus,
                AgeReached = r.AgeReached,
                Points = r.Points.Select(p => new RetirementPointDto { Age = p.Age, Projected = p.Projected, Needed = p.Needed }).ToList(),
            };
        }

        return new FinancialPlanDto
        {
            BaseCurrency = baseCurrency,
            Assumptions = assumptions,
            Age = age,
            AgeFromHealth = healthBirth is not null,
            Investments = investments,
            MonthlySavingActual = actualSaving,
            MonthlySavingUsed = saving,
            Goals = goals,
            Retirement = retirement,
            Missing = missing,
        };
    }

    public async Task<OperationResult<FinancialPlanDto>> SaveAssumptionsAsync(PlanAssumptionsRequest request)
    {
        var error = request.Today == default ? "Today's date is required."
            : request.ExpectedReturnPercent is < 0 or > 30 ? "The expected return is a % between 0 and 30."
            : request.InflationPercent is < 0 or > 30 ? "Inflation is a % between 0 and 30."
            : request.BirthDate is { } b && (b > request.Today || b < request.Today.AddYears(-120)) ? "That isn't a date of birth."
            : request.RetirementAge is < 30 or > 100 ? "Retire between 30 and 100."
            : request.BirthDate is { } b2 && request.RetirementAge <= FinancialPlan.Age(b2, request.Today) ? "That retirement age has already passed."
            : request.YearsInRetirement is < 1 or > 60 ? "Plan for 1 to 60 years in retirement."
            : request.MonthlySpending is <= 0 || request.MonthlySpending > FinanceRules.MaxAmount ? "Monthly spending has to be more than zero (or left blank)."
            : request.MonthlySaving is < 0 || request.MonthlySaving > FinanceRules.MaxAmount ? "Monthly saving can't be negative."
            : null;
        if (error is not null)
        {
            return OperationResult<FinancialPlanDto>.Fail(error);
        }

        var row = await db.PlanAssumptions.FirstOrDefaultAsync();
        if (row is null)
        {
            row = new PlanAssumption { UserId = db.CurrentUserId!.Value };
            db.PlanAssumptions.Add(row);
        }
        else
        {
            row.UpdatedAt = DateTime.UtcNow;
        }

        row.ExpectedReturnPercent = request.ExpectedReturnPercent;
        row.InflationPercent = request.InflationPercent;
        row.BirthDate = request.BirthDate;
        row.RetirementAge = request.RetirementAge;
        row.YearsInRetirement = request.YearsInRetirement;
        row.MonthlySpending = request.MonthlySpending;
        row.MonthlySaving = request.MonthlySaving;
        await db.SaveChangesAsync();
        return OperationResult<FinancialPlanDto>.Ok(await GetAsync(request.Today));
    }
}
