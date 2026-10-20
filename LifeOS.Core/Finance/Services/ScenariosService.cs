using LifeOS.Core.Finance.DTOs;
using LifeOS.Core.Finance.ServiceContracts;
using LifeOS.Core.Models;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Shared.Services;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Finance.Services;

/// <summary>
/// "Can I afford it?" (Session 71c). A scenario is a named set of what-ifs (lines replaced whole on save). Its impact is
/// worked out in memory and never stored or written anywhere: the cash-flow forecast with its money on top
/// (<see cref="IForecastService.ResultAsync"/>, 12 months), each savings goal's months to reach and the retirement age
/// re-simulated with its month-by-month changes (<see cref="ScenarioMath"/>, from <see cref="IPlanService"/>'s
/// figures). Lines are in the base currency.
/// </summary>
public class ScenariosService(AppDbContext db, IForecastService forecastService, IPlanService planService) : IScenariosService
{
    private const string NotFound = "Scenario not found.";
    private const string Duplicate = "You already have a scenario with that name.";
    private const int ForecastMonths = 12;

    public async Task<List<ScenarioDto>> GetAllAsync()
    {
        var scenarios = await db.Scenarios.OrderBy(s => s.Name).Select(s => new { s.Id, s.Name, s.Notes }).ToListAsync();
        var lines = (await LinesQuery(db.ScenarioLines).ToListAsync()).ToLookup(l => l.ScenarioId);
        return scenarios.Select(s => new ScenarioDto { Id = s.Id, Name = s.Name, Notes = s.Notes, Lines = lines[s.Id].Select(l => l.Line).ToList() })
            .ToList();
    }

    public async Task<OperationResult<ScenarioDto>> GetAsync(int id)
    {
        var scenario = await db.Scenarios.Where(s => s.Id == id).Select(s => new { s.Id, s.Name, s.Notes }).FirstOrDefaultAsync();
        if (scenario is null)
        {
            return OperationResult<ScenarioDto>.Fail(NotFound);
        }

        var lines = await LinesQuery(db.ScenarioLines.Where(l => l.ScenarioId == id)).Select(l => l.Line).ToListAsync();
        return OperationResult<ScenarioDto>.Ok(new ScenarioDto { Id = scenario.Id, Name = scenario.Name, Notes = scenario.Notes, Lines = lines });
    }

    public async Task<OperationResult<ScenarioDto>> CreateAsync(ScenarioRequest request)
    {
        var scenario = new Scenario { UserId = db.CurrentUserId!.Value };
        return await SaveAsync(scenario, request, isNew: true);
    }

    public async Task<OperationResult<ScenarioDto>> UpdateAsync(int id, ScenarioRequest request)
    {
        var scenario = await db.Scenarios.FindAsync(id);
        return scenario is null ? OperationResult<ScenarioDto>.Fail(NotFound) : await SaveAsync(scenario, request, isNew: false);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var scenario = await db.Scenarios.FindAsync(id);
        if (scenario is null)
        {
            return OperationResult<bool>.Fail(NotFound);
        }

        // A what-if only: nothing in Finance points at it.
        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        await db.ScenarioLines.Where(l => l.ScenarioId == id)
            .ExecuteUpdateAsync(s => s.SetProperty(l => l.IsDeleted, true).SetProperty(l => l.DeletedAt, now));
        scenario.IsDeleted = true;
        scenario.DeletedAt = now;
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return OperationResult<bool>.Ok(true);
    }

    public async Task<OperationResult<ScenarioImpactDto>> ImpactAsync(int id, DateOnly today)
    {
        if (today == default)
        {
            return OperationResult<ScenarioImpactDto>.Fail("Today's date is required.");
        }

        var scenario = await GetAsync(id);
        if (!scenario.Success)
        {
            return OperationResult<ScenarioImpactDto>.Fail(scenario.Error!);
        }

        var lines = scenario.Data!.Lines
            .Select(l => new ScenarioLineInput(l.Kind, l.Title, l.Amount, l.StartsOn, l.EndsOn, l.AccountId, l.AnnualRate, l.TermMonths))
            .ToList();
        return OperationResult<ScenarioImpactDto>.Ok(await ImpactOfAsync(lines, today));
    }

    public async Task<OperationResult<ScenarioImpactDto>> PreviewAsync(ScenarioPreviewRequest request)
    {
        var (lines, error) = await CheckLinesAsync(request.Lines, request.Today);
        return error is not null ? OperationResult<ScenarioImpactDto>.Fail(error) : OperationResult<ScenarioImpactDto>.Ok(await ImpactOfAsync(lines!, request.Today));
    }

    private async Task<ScenarioImpactDto> ImpactOfAsync(List<ScenarioLineInput> lines, DateOnly today)
    {
        var baseCurrency = await db.Users.Where(u => u.Id == db.CurrentUserId).Select(u => u.BaseCurrency).FirstOrDefaultAsync();
        var until = today.AddMonths(ForecastMonths);
        if (baseCurrency is null)
        {
            return new ScenarioImpactDto { Until = until };
        }

        lines = ScenarioMath.Upcoming(lines, today);
        var flows = ScenarioMath.Flows(lines, until, baseCurrency);
        var before = await forecastService.ResultAsync(today, until, null);
        var after = await forecastService.ResultAsync(today, until, flows);
        var lows = new List<ScenarioLowDto>();
        if (before is not null && after is not null)
        {
            lows.Add(Low(before.Overall, after.Overall));
            foreach (var accountId in lines.Where(l => l.AccountId is not null).Select(l => l.AccountId!.Value).Distinct())
            {
                var b = before.Accounts.FirstOrDefault(a => a.AccountId == accountId && a.Currency == baseCurrency);
                var a = after.Accounts.FirstOrDefault(x => x.AccountId == accountId && x.Currency == baseCurrency);
                if (b is not null && a is not null)
                {
                    lows.Add(Low(b, a));
                }
            }
        }

        var plan = await planService.GetAsync(today);
        var changes = ScenarioMath.MonthlyChanges(lines, today, 1200);
        var r = plan.Assumptions.ExpectedReturnPercent;
        var goals = ScenarioMath.Goals(
                plan.Goals.Where(g => g.Currency == baseCurrency && g.Status is not SavingsPlanStatuses.Reached)
                    .Select(g => new ScenarioGoal(g.GoalId, g.Title, g.TargetAmount, g.Saved, g.ActualPerMonth))
                    .ToList(),
                changes, r)
            .Select(g => new ScenarioGoalDto { GoalId = g.Id, Title = g.Title, MonthsBefore = g.MonthsBefore, MonthsAfter = g.MonthsAfter })
            .ToList();

        ScenarioRetirementDto? retirement = null;
        if (plan.Retirement is not null && plan.Age is { } age && plan.Assumptions.MonthlySpending is { } spending)
        {
            var a = plan.Assumptions;
            var (ageBefore, projectedBefore) = ScenarioMath.Retirement(age, a.RetirementAge, a.YearsInRetirement, spending, plan.Investments,
                plan.MonthlySavingUsed, r, a.InflationPercent);
            var (ageAfter, projectedAfter) = ScenarioMath.Retirement(age, a.RetirementAge, a.YearsInRetirement, spending, plan.Investments,
                plan.MonthlySavingUsed, r, a.InflationPercent, changes);
            retirement = new ScenarioRetirementDto
            {
                AgeBefore = ageBefore,
                AgeAfter = ageAfter,
                ProjectedBefore = projectedBefore,
                ProjectedAfter = projectedAfter,
                RetirementAge = a.RetirementAge,
            };
        }

        return new ScenarioImpactDto
        {
            BaseCurrency = baseCurrency,
            Until = until,
            Lows = lows,
            Goals = goals,
            Retirement = retirement,
            NextTwelveMonths = changes.Take(ForecastMonths + 1).Sum(),
        };
    }

    private static ScenarioLowDto Low(ForecastLine before, ForecastLine after) => new()
    {
        AccountId = before.AccountId,
        Name = before.Name,
        Before = new ForecastPointDto { Day = before.Lowest.Day, Balance = before.Lowest.Balance },
        After = new ForecastPointDto { Day = after.Lowest.Day, Balance = after.Lowest.Balance },
        EndBefore = before.End,
        EndAfter = after.End,
    };

    private async Task<OperationResult<ScenarioDto>> SaveAsync(Scenario scenario, ScenarioRequest request, bool isNew)
    {
        var name = request.Name.Trim();
        if (name.Length == 0)
        {
            return OperationResult<ScenarioDto>.Fail("Name the scenario (e.g. New car next spring).");
        }

        if (await db.Scenarios.AnyAsync(s => s.Name == name && s.Id != scenario.Id))
        {
            return OperationResult<ScenarioDto>.Fail(Duplicate);
        }

        var (lines, error) = await CheckLinesAsync(request.Lines, request.Today);
        if (error is not null)
        {
            return OperationResult<ScenarioDto>.Fail(error);
        }

        scenario.Name = name;
        scenario.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        var now = DateTime.UtcNow;
        await using var transaction = await db.Database.BeginOrJoinTransactionAsync();
        if (isNew)
        {
            db.Scenarios.Add(scenario);
        }
        else
        {
            scenario.UpdatedAt = now;
            await db.ScenarioLines.Where(l => l.ScenarioId == scenario.Id)
                .ExecuteUpdateAsync(s => s.SetProperty(l => l.IsDeleted, true).SetProperty(l => l.DeletedAt, now));
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.IsUniqueConstraintViolation())
        {
            return OperationResult<ScenarioDto>.Fail(Duplicate);
        }

        var order = 0;
        foreach (var line in lines!)
        {
            db.ScenarioLines.Add(new ScenarioLine
            {
                UserId = scenario.UserId,
                ScenarioId = scenario.Id,
                Kind = line.Kind,
                Title = line.Title.Trim(),
                Amount = line.Amount,
                StartsOn = line.StartsOn,
                EndsOn = line.EndsOn,
                AccountId = line.AccountId,
                AnnualRate = line.AnnualRate,
                TermMonths = line.TermMonths,
                SortOrder = order++,
            });
        }

        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return await GetAsync(scenario.Id);
    }

    private async Task<(List<ScenarioLineInput>? Lines, string? Error)> CheckLinesAsync(List<ScenarioLineRequest> requests, DateOnly today)
    {
        if (today == default)
        {
            return (null, "Today's date is required.");
        }

        if (requests.Count == 0)
        {
            return (null, "Add at least one what-if.");
        }

        if (requests.Count > 50)
        {
            return (null, "Keep a scenario to 50 lines.");
        }

        var lines = requests.Select(r => new ScenarioLineInput(r.Kind, r.Title, r.Amount, r.StartsOn, r.EndsOn, r.AccountId, r.AnnualRate, r.TermMonths)).ToList();
        foreach (var line in lines)
        {
            if (ScenarioMath.Check(line, today) is { } error)
            {
                return (null, error);
            }
        }

        var accountIds = lines.Where(l => l.AccountId is not null).Select(l => l.AccountId!.Value).Distinct().ToList();
        if (accountIds.Count > 0 && await db.Accounts.CountAsync(a => accountIds.Contains(a.Id)) != accountIds.Count)
        {
            return (null, "Account not found.");
        }

        return (lines, null);
    }

    private static IQueryable<LineRow> LinesQuery(IQueryable<ScenarioLine> source) =>
        source.OrderBy(l => l.SortOrder).ThenBy(l => l.Id).Select(l => new LineRow(l.ScenarioId, new ScenarioLineDto
        {
            Id = l.Id,
            Kind = l.Kind,
            Title = l.Title,
            Amount = l.Amount,
            StartsOn = l.StartsOn,
            EndsOn = l.EndsOn,
            AccountId = l.AccountId,
            AccountName = l.Account != null ? l.Account.Name : null,
            AnnualRate = l.AnnualRate,
            TermMonths = l.TermMonths,
        }));

    private sealed record LineRow(int ScenarioId, ScenarioLineDto Line);
}
