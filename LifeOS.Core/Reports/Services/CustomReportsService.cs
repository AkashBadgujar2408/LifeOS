using LifeOS.Core.Models;
using LifeOS.Core.Reports.DTOs;
using LifeOS.Core.Reports.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace LifeOS.Core.Reports.Services;

/// <summary>
/// Custom reports (Session 93): a definition (what, filter, days, grouping, comparison) run through the report tabs'
/// own methods — once for the whole period and once per week/month bucket, then the same for the period it's compared
/// with — and read off by <see cref="CustomReports"/>. Only definitions are saved (reports.SavedReports); a saved one
/// reruns from scratch, so a fixed range always gives the same result. Calls run in turn (one DbContext).
/// </summary>
public class CustomReportsService(AppDbContext db, IReportsService reportsService) : ICustomReportsService
{
    private const string DuplicateName = "You already have a saved report with that name.";

    public IReadOnlyList<CustomMetricDto> Metrics() => CustomReports.Metrics;

    public async Task<OperationResult<CustomReportResultDto>> RunAsync(CustomReportDefinition definition, DateOnly today, string? timeZone)
    {
        if (await CheckAsync(definition, today) is { } error)
        {
            return OperationResult<CustomReportResultDto>.Fail(error);
        }

        CustomReports.Check(definition, today, out var from, out var to);
        var metric = CustomReports.Metric(definition.Metric)!;

        // The zone is checked once up front (every report would refuse an unknown one the same way).
        var probe = await reportsService.GetGoalReportAsync(today, today, today, timeZone);
        if (!probe.Success)
        {
            return OperationResult<CustomReportResultDto>.Fail(probe.Error!);
        }

        var period = await PeriodAsync(definition, metric, from, to, today, timeZone);
        CustomPeriodDto? compared = null;
        if (CustomReports.CompareRange(from, to, definition.Compare) is { } other)
        {
            compared = await PeriodAsync(definition, metric, other.From, other.To, today, timeZone);
        }

        string? currency = null;
        if (metric.Unit == CustomMetricUnits.Money)
        {
            currency = await db.Users.Where(u => u.Id == db.CurrentUserId).Select(u => u.BaseCurrency).FirstOrDefaultAsync();
        }

        return OperationResult<CustomReportResultDto>.Ok(new CustomReportResultDto
        {
            Metric = metric,
            LifeAreaId = definition.LifeAreaId,
            LifeAreaName = definition.LifeAreaId is { } areaId
                ? await db.LifeAreas.Where(a => a.Id == areaId).Select(a => a.Name).FirstOrDefaultAsync()
                : null,
            TagId = definition.TagId,
            TagName = definition.TagId is { } tagId
                ? await db.Tags.Where(t => t.Id == tagId).Select(t => t.Name).FirstOrDefaultAsync()
                : null,
            Currency = currency,
            Grouping = definition.Grouping,
            Period = period,
            Compared = compared,
            Change = period.Total is { } now && compared?.Total is { } before ? now - before : null,
        });
    }

    public async Task<List<SavedReportDto>> ListAsync() =>
        (await db.SavedReports.AsNoTracking().OrderBy(r => r.Name).ToListAsync()).Select(ToDto).ToList();

    public async Task<OperationResult<SavedReportDto>> GetAsync(int id) =>
        await db.SavedReports.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id) is { } row
            ? OperationResult<SavedReportDto>.Ok(ToDto(row))
            : OperationResult<SavedReportDto>.Fail("Saved report not found.");

    public async Task<OperationResult<CustomReportResultDto>> RunSavedAsync(int id, DateOnly today, string? timeZone)
    {
        var saved = await GetAsync(id);
        return saved.Success
            ? await RunAsync(saved.Data!, today, timeZone)
            : OperationResult<CustomReportResultDto>.Fail(saved.Error!);
    }

    public async Task<OperationResult<SavedReportDto>> CreateAsync(SavedReportRequest request, DateOnly today)
    {
        var name = request.Name.Trim();
        if (await CheckSaveAsync(request, name, today, null) is { } error)
        {
            return OperationResult<SavedReportDto>.Fail(error);
        }

        var row = new SavedReport { UserId = db.CurrentUserId!.Value };
        Apply(row, request, name);
        db.SavedReports.Add(row);
        return await SaveAsync(row);
    }

    public async Task<OperationResult<SavedReportDto>> UpdateAsync(int id, SavedReportRequest request, DateOnly today)
    {
        var row = await db.SavedReports.FirstOrDefaultAsync(r => r.Id == id);
        if (row is null)
        {
            return OperationResult<SavedReportDto>.Fail("Saved report not found.");
        }

        var name = request.Name.Trim();
        if (await CheckSaveAsync(request, name, today, id) is { } error)
        {
            return OperationResult<SavedReportDto>.Fail(error);
        }

        Apply(row, request, name);
        row.UpdatedAt = DateTime.UtcNow;
        return await SaveAsync(row);
    }

    public async Task<OperationResult<bool>> DeleteAsync(int id)
    {
        var row = await db.SavedReports.FirstOrDefaultAsync(r => r.Id == id);
        if (row is null)
        {
            return OperationResult<bool>.Fail("Saved report not found.");
        }

        row.IsDeleted = true;
        row.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return OperationResult<bool>.Ok(true);
    }

    /// <summary>The whole period's figure, then each week/month's.</summary>
    private async Task<CustomPeriodDto> PeriodAsync(
        CustomReportDefinition definition, CustomMetricDto metric, DateOnly from, DateOnly to, DateOnly today, string? timeZone)
    {
        var buckets = new List<CustomBucketDto>();
        foreach (var (bucketFrom, bucketTo) in CustomReports.Buckets(from, to, today, definition.Grouping))
        {
            buckets.Add(new CustomBucketDto
            {
                From = bucketFrom,
                To = bucketTo,
                Value = await ValueAsync(definition, metric, bucketFrom, bucketTo, today, timeZone),
            });
        }

        return new CustomPeriodDto
        {
            From = from,
            To = to,
            Total = await ValueAsync(definition, metric, from, to, today, timeZone),
            Buckets = buckets,
        };
    }

    /// <summary>Runs the report the metric repeats over from..to and reads the metric off it.</summary>
    private async Task<decimal?> ValueAsync(
        CustomReportDefinition d, CustomMetricDto metric, DateOnly from, DateOnly to, DateOnly today, string? timeZone) =>
        metric.Report switch
        {
            "goals" => CustomReports.FromGoals((await reportsService.GetGoalReportAsync(from, to, today, timeZone)).Data!, d.Metric, d.LifeAreaId),
            "habits" => CustomReports.FromHabits((await reportsService.GetHabitReportAsync(from, to, today, timeZone)).Data!, d.LifeAreaId),
            "productivity" => CustomReports.FromProductivity((await reportsService.GetProductivityReportAsync(from, to, today, timeZone)).Data!, d.Metric, d.LifeAreaId),
            "learning" => (await reportsService.GetLearningReportAsync(from, to, today, timeZone)).Data!.TotalMinutes,
            "money" => CustomReports.FromFinance((await reportsService.GetFinanceReportAsync(from, to, today, timeZone)).Data!, d.Metric, d.TagId),
            "balance" => CustomReports.FromBalance((await reportsService.GetLifeBalanceReportAsync(from, to, today, timeZone)).Data!, d.Metric, d.LifeAreaId!.Value),
            _ => null,
        };

    /// <summary>The pure checks plus the ones that need data: the life area and the tag exist (the tag is the user's).</summary>
    private async Task<string?> CheckAsync(CustomReportDefinition definition, DateOnly today)
    {
        if (today == default)
        {
            return "Today's date is required.";
        }

        if (CustomReports.Check(definition, today, out _, out _) is { } error)
        {
            return error;
        }

        if (definition.LifeAreaId is { } areaId && !await db.LifeAreas.AnyAsync(a => a.Id == areaId))
        {
            return "Life area not found.";
        }

        return definition.TagId is { } tagId && !await db.Tags.AnyAsync(t => t.Id == tagId) ? "Tag not found." : null;
    }

    private async Task<string?> CheckSaveAsync(SavedReportRequest request, string name, DateOnly today, int? id)
    {
        if (name.Length == 0)
        {
            return "Give the report a name.";
        }

        if (name.Length > 100)
        {
            return "Keep the name to 100 characters.";
        }

        if (await CheckAsync(request, today) is { } error)
        {
            return error;
        }

        return await db.SavedReports.AnyAsync(r => r.Name == name && r.Id != id) ? DuplicateName : null;
    }

    private async Task<OperationResult<SavedReportDto>> SaveAsync(SavedReport row)
    {
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.InnerException is SqlException { Number: 2627 or 2601 })
        {
            return OperationResult<SavedReportDto>.Fail(DuplicateName);
        }

        return OperationResult<SavedReportDto>.Ok(ToDto(row));
    }

    private static void Apply(SavedReport row, SavedReportRequest request, string name)
    {
        row.Name = name;
        row.Metric = request.Metric;
        row.LifeAreaId = request.LifeAreaId;
        row.TagId = request.TagId;
        row.Grouping = request.Grouping;
        row.Compare = request.Compare;
        row.RangePreset = request.RangePreset;
        row.FromDate = request.RangePreset is null ? request.From : null;
        row.ToDate = request.RangePreset is null ? request.To : null;
    }

    private static SavedReportDto ToDto(SavedReport r) => new()
    {
        Id = r.Id,
        Name = r.Name,
        Metric = r.Metric,
        LifeAreaId = r.LifeAreaId,
        TagId = r.TagId,
        Grouping = r.Grouping,
        Compare = r.Compare,
        RangePreset = r.RangePreset,
        From = r.FromDate,
        To = r.ToDate,
    };
}
