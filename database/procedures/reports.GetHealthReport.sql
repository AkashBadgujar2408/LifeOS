USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- The health report's raw rows (Session 91) — served only behind the vault unlock (ReportsController.Health carries
-- [VaultUnlockRequired]). Five result sets read in this order by ReportsService; no Notes column is read (they are
-- encrypted and say nothing a figure needs):
--   1. workouts on days in the range
--   2. sleep records that ended on a morning in the range (HealthTrends.Nights adds up a night and leaves naps out)
--   3. body measurements in the range
--   4. stress / energy check-ins in the range
--   5. journal moods in the range (mood lives in the Journal; the wellbeing page reads both the same way)
-- Every branch filters UserId/IsDeleted itself (EF's filters don't apply here).
CREATE OR ALTER PROCEDURE reports.GetHealthReport
    @UserId     INT,
    @FromDate   DATE,
    @ToDate     DATE
AS
BEGIN
    SET NOCOUNT ON;

    IF @ToDate < @FromDate
        THROW 50001, 'The end of the range must be after its start.', 1;

    SELECT w.OccurredOn, w.Kind, w.Minutes, w.Steps, w.DistanceKm, w.Calories
    FROM health.Workouts w
    WHERE w.UserId = @UserId AND w.IsDeleted = 0
      AND w.OccurredOn BETWEEN @FromDate AND @ToDate
    ORDER BY w.OccurredOn, w.Id;

    SELECT s.WokeOn, s.StartedAt, s.EndedAt, s.Quality, s.IsNap
    FROM health.SleepRecords s
    WHERE s.UserId = @UserId AND s.IsDeleted = 0
      AND s.WokeOn BETWEEN @FromDate AND @ToDate
    ORDER BY s.WokeOn, s.StartedAt;

    SELECT m.Kind, m.MeasuredOn, m.Value, m.Value2
    FROM health.BodyMeasurements m
    WHERE m.UserId = @UserId AND m.IsDeleted = 0
      AND m.MeasuredOn BETWEEN @FromDate AND @ToDate
    ORDER BY m.Kind, m.MeasuredOn, m.Id;

    SELECT c.CheckInOn, c.StressLevel, c.EnergyLevel
    FROM health.WellnessCheckIns c
    WHERE c.UserId = @UserId AND c.IsDeleted = 0
      AND c.CheckInOn BETWEEN @FromDate AND @ToDate
    ORDER BY c.CheckInOn;

    SELECT je.EntryDate, je.Mood
    FROM journal.JournalEntries je
    WHERE je.UserId = @UserId AND je.IsDeleted = 0
      AND je.Mood IS NOT NULL
      AND je.EntryDate BETWEEN @FromDate AND @ToDate
    ORDER BY je.EntryDate;
END
GO
