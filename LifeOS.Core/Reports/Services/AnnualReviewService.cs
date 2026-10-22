using LifeOS.Core.Leisure.ServiceContracts;
using LifeOS.Core.Reports.DTOs;
using LifeOS.Core.Reports.ServiceContracts;
using LifeOS.Core.Shared.DTOs;
using LifeOS.Core.Story.ServiceContracts;

namespace LifeOS.Core.Reports.Services;

/// <summary>
/// The Annual Life Review (Session 92): a year from every side, put together from what already computes it — the
/// Story (chapters, achievements, beats) and every report over Jan 1 – Dec 31 through <see cref="IReportsService"/> —
/// so the year page always agrees with the Story and the report tabs. Nothing is stored. Health stays out (it would
/// need the vault unlock). Calls run one after another: they share one DbContext.
/// </summary>
public class AnnualReviewService(
    IReportsService reportsService,
    IChaptersService chaptersService,
    IAchievementsService achievementsService,
    ILifeStoryService lifeStoryService,
    IMediaItemsService mediaItemsService) : IAnnualReviewService
{
    /// <summary>The earliest year a review is offered for (the datepickers' floor).</summary>
    public const int FirstYear = 1960;

    public async Task<OperationResult<AnnualReviewDto>> GetAsync(int year, DateOnly today, string? timeZone)
    {
        if (year < FirstYear || year > today.Year)
        {
            return OperationResult<AnnualReviewDto>.Fail($"Pick a year from {FirstYear} to {today.Year}.");
        }

        var from = new DateOnly(year, 1, 1);
        var to = new DateOnly(year, 12, 31);

        var goals = await reportsService.GetGoalReportAsync(from, to, today, timeZone);
        if (!goals.Success)
        {
            return OperationResult<AnnualReviewDto>.Fail(goals.Error!); // an unknown zone — the rest would say the same
        }

        var habits = (await reportsService.GetHabitReportAsync(from, to, today, timeZone)).Data!;
        var productivity = (await reportsService.GetProductivityReportAsync(from, to, today, timeZone)).Data!;
        var learning = (await reportsService.GetLearningReportAsync(from, to, today, timeZone)).Data!;
        var money = (await reportsService.GetFinanceReportAsync(from, to, today, timeZone)).Data!;
        var balance = (await reportsService.GetLifeBalanceReportAsync(from, to, today, timeZone)).Data!;
        var media = await mediaItemsService.YearInMediaAsync(year);
        var chapters = await chaptersService.ListAsync();
        var achievements = (await achievementsService.GetAsync(timeZone)).Data ?? [];
        var story = (await lifeStoryService.GetAsync(timeZone)).Data;
        var (beatCount, highlights) = AnnualReview.Beats(story?.Sections.SelectMany(s => s.Beats) ?? [], year);

        return OperationResult<AnnualReviewDto>.Ok(new AnnualReviewDto
        {
            Year = year,
            From = from,
            To = to,
            Chapters = AnnualReview.ChaptersIn(chapters, year, today),
            Achievements = [.. achievements.Where(a => a.UnlockedOn?.Year == year).OrderBy(a => a.UnlockedOn)],
            StoryBeats = beatCount,
            Highlights = highlights,
            Goals = goals.Data!.Totals,
            HabitsBuild = habits.Build,
            HabitsAvoid = habits.Avoid,
            Tasks = productivity.Tasks,
            Focus = productivity.Focus,
            StudyMinutes = learning.TotalMinutes,
            CoursesCompleted = learning.CoursesCompleted,
            BooksFinished = learning.BooksFinished,
            SkillLevelUps = learning.LevelUps,
            Certifications = learning.Certifications,
            Money = money,
            Media = media,
            LifeBalance = balance.Areas,
        });
    }
}
