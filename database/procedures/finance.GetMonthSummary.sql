USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- A month's money (Session 57): budgets per tag against what was actually spent, and the month's totals, all in
-- the user's base currency @BaseCurrency (a transaction in another currency counts at its ExchangeRate; one with
-- no rate can't be compared and is counted apart). @MonthStart is the month's first day.
--
-- Set 1, one row per tag that has a budget this month or an expense tagged with it:
--   TagId, TagName, BudgetId / Budget / BudgetCurrency (NULL: no budget), Spent, Unconverted, TransactionCount
--   An expense with two tags counts toward both — that's what a per-tag budget means.
-- Set 2, one row — the month as a whole, each transaction once (so tags can't double it):
--   Income, Spending, UntaggedSpending, Unconverted
--
-- Transfers are neither income nor spending. Every branch filters UserId/IsDeleted itself (EF's filters don't
-- apply here); BudgetsService.Summarise (C#) works out remaining / % used / over.
CREATE OR ALTER PROCEDURE finance.GetMonthSummary
    @UserId INT,
    @MonthStart DATE,
    @BaseCurrency CHAR(3)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @MonthEnd DATE = EOMONTH(@MonthStart);

    -- Each transaction of the month with its base-currency amount (NULL when it can't be converted).
    WITH Month AS
    (
        SELECT t.Id, t.Kind,
               CASE WHEN t.Currency = @BaseCurrency THEN t.Amount
                    WHEN t.ExchangeRate IS NOT NULL THEN ROUND(t.Amount * t.ExchangeRate, 4)
               END AS InBase
        FROM finance.Transactions t
        WHERE t.UserId = @UserId AND t.IsDeleted = 0
          AND t.OccurredOn BETWEEN @MonthStart AND @MonthEnd
          AND t.Kind IN ('Income', 'Expense')
    ),
    Spend AS
    (
        SELECT tt.TagId,
               SUM(m.InBase) AS Spent,
               SUM(CASE WHEN m.InBase IS NULL THEN 1 ELSE 0 END) AS Unconverted,
               COUNT(*) AS TransactionCount
        FROM Month m
        JOIN finance.TransactionTags tt ON tt.TransactionId = m.Id AND tt.UserId = @UserId AND tt.IsDeleted = 0
        WHERE m.Kind = 'Expense'
        GROUP BY tt.TagId
    ),
    Planned AS
    (
        SELECT b.Id, b.TagId, b.Amount, b.Currency
        FROM finance.Budgets b
        WHERE b.UserId = @UserId AND b.IsDeleted = 0 AND b.MonthStart = @MonthStart
    )
    SELECT g.Id AS TagId, g.Name AS TagName,
           p.Id AS BudgetId, p.Amount AS Budget, p.Currency AS BudgetCurrency,
           COALESCE(s.Spent, 0) AS Spent,
           COALESCE(s.Unconverted, 0) AS Unconverted,
           COALESCE(s.TransactionCount, 0) AS TransactionCount
    FROM shared.Tags g
    LEFT JOIN Planned p ON p.TagId = g.Id
    LEFT JOIN Spend s ON s.TagId = g.Id
    WHERE g.UserId = @UserId AND g.IsDeleted = 0
      AND (p.Id IS NOT NULL OR s.TagId IS NOT NULL);

    WITH Month AS
    (
        SELECT t.Id, t.Kind,
               CASE WHEN t.Currency = @BaseCurrency THEN t.Amount
                    WHEN t.ExchangeRate IS NOT NULL THEN ROUND(t.Amount * t.ExchangeRate, 4)
               END AS InBase,
               CASE WHEN EXISTS (SELECT 1 FROM finance.TransactionTags tt
                                 WHERE tt.TransactionId = t.Id AND tt.UserId = @UserId AND tt.IsDeleted = 0)
                    THEN 1 ELSE 0 END AS IsTagged
        FROM finance.Transactions t
        WHERE t.UserId = @UserId AND t.IsDeleted = 0
          AND t.OccurredOn BETWEEN @MonthStart AND @MonthEnd
          AND t.Kind IN ('Income', 'Expense')
    )
    SELECT COALESCE(SUM(CASE WHEN Kind = 'Income' THEN InBase END), 0) AS Income,
           COALESCE(SUM(CASE WHEN Kind = 'Expense' THEN InBase END), 0) AS Spending,
           COALESCE(SUM(CASE WHEN Kind = 'Expense' AND IsTagged = 0 THEN InBase END), 0) AS UntaggedSpending,
           COALESCE(SUM(CASE WHEN InBase IS NULL THEN 1 ELSE 0 END), 0) AS Unconverted
    FROM Month;
END
GO
