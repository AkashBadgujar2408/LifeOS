USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Money in and out month by month (Session 59, the Reports page), in the user's base currency @BaseCurrency — the
-- same conversion as finance.GetMonthSummary (the transaction's own ExchangeRate; none = counted apart), so a
-- month here always matches that month's ledger totals. @FromMonth is the first month's first day, @ToDate the
-- last day included.
--
-- Set 1, one row per month that has any income or expense (CashFlowReport fills the empty months in C#):
--   MonthStart, Income, Spending, Unconverted
-- Set 2, one row per tag with spending in the range — an expense with two tags counts toward both (as budgets do):
--   TagId, TagName, Spent, TransactionCount
-- Set 3, one row — spending in the range with no tag at all.
--
-- Transfers are neither income nor spending. Every branch filters UserId/IsDeleted itself.
CREATE OR ALTER PROCEDURE finance.GetCashFlow
    @UserId INT,
    @FromMonth DATE,
    @ToDate DATE,
    @BaseCurrency CHAR(3)
AS
BEGIN
    SET NOCOUNT ON;

    IF @ToDate < @FromMonth
        THROW 50001, 'The end of the range must be after its start.', 1;

    WITH Moves AS
    (
        SELECT t.Kind,
               DATEFROMPARTS(YEAR(t.OccurredOn), MONTH(t.OccurredOn), 1) AS MonthStart,
               CASE WHEN t.Currency = @BaseCurrency THEN t.Amount
                    WHEN t.ExchangeRate IS NOT NULL THEN ROUND(t.Amount * t.ExchangeRate, 4)
               END AS InBase
        FROM finance.Transactions t
        WHERE t.UserId = @UserId AND t.IsDeleted = 0
          AND t.OccurredOn BETWEEN @FromMonth AND @ToDate
          AND t.Kind IN ('Income', 'Expense')
    )
    SELECT MonthStart,
           COALESCE(SUM(CASE WHEN Kind = 'Income' THEN InBase END), 0) AS Income,
           COALESCE(SUM(CASE WHEN Kind = 'Expense' THEN InBase END), 0) AS Spending,
           SUM(CASE WHEN InBase IS NULL THEN 1 ELSE 0 END) AS Unconverted
    FROM Moves
    GROUP BY MonthStart
    ORDER BY MonthStart;

    WITH Spent AS
    (
        SELECT t.Id,
               CASE WHEN t.Currency = @BaseCurrency THEN t.Amount
                    WHEN t.ExchangeRate IS NOT NULL THEN ROUND(t.Amount * t.ExchangeRate, 4)
               END AS InBase
        FROM finance.Transactions t
        WHERE t.UserId = @UserId AND t.IsDeleted = 0
          AND t.OccurredOn BETWEEN @FromMonth AND @ToDate
          AND t.Kind = 'Expense'
    )
    SELECT g.Id AS TagId, g.Name AS TagName,
           COALESCE(SUM(s.InBase), 0) AS Spent,
           COUNT(*) AS TransactionCount
    FROM Spent s
    JOIN finance.TransactionTags tt ON tt.TransactionId = s.Id AND tt.UserId = @UserId AND tt.IsDeleted = 0
    JOIN shared.Tags g ON g.Id = tt.TagId AND g.UserId = @UserId AND g.IsDeleted = 0
    GROUP BY g.Id, g.Name
    ORDER BY Spent DESC, g.Name;

    SELECT COALESCE(SUM(CASE WHEN t.Currency = @BaseCurrency THEN t.Amount
                             WHEN t.ExchangeRate IS NOT NULL THEN ROUND(t.Amount * t.ExchangeRate, 4)
                        END), 0) AS UntaggedSpending
    FROM finance.Transactions t
    WHERE t.UserId = @UserId AND t.IsDeleted = 0
      AND t.OccurredOn BETWEEN @FromMonth AND @ToDate
      AND t.Kind = 'Expense'
      AND NOT EXISTS (SELECT 1 FROM finance.TransactionTags tt
                      WHERE tt.TransactionId = t.Id AND tt.UserId = @UserId AND tt.IsDeleted = 0);
END
GO
