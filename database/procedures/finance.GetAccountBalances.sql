USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Account balances (Session 56): what each of the user's accounts held at the end of the local day @AsOf, in the
-- account's own currency — never stored. One row per account (archived ones too), including those with no
-- transactions yet.
--
--   AccountId         the account
--   MoneyIn           income into it + transfers into it (what arrived: ToAmount for a cross-currency transfer)
--   MoneyOut          expenses from it + transfers out of it
--   TransactionCount  transactions touching it, on any day
--   LastOn            the latest day it moved (any day, so a future-dated one shows)
--
-- Balance = OpeningBalance + MoneyIn - MoneyOut (C#, AccountBalances). Only transactions on or after the opening
-- date and on or before @AsOf count. Every branch filters UserId/IsDeleted itself (EF's filters don't apply here).
CREATE OR ALTER PROCEDURE finance.GetAccountBalances
    @UserId INT,
    @AsOf DATE
AS
BEGIN
    SET NOCOUNT ON;

    WITH Moves AS
    (
        SELECT t.ToAccountId AS AccountId, t.OccurredOn,
               COALESCE(t.ToAmount, t.Amount) AS MoneyIn, CAST(0 AS DECIMAL(19, 4)) AS MoneyOut
        FROM finance.Transactions t
        WHERE t.UserId = @UserId AND t.IsDeleted = 0 AND t.ToAccountId IS NOT NULL

        UNION ALL

        SELECT t.FromAccountId, t.OccurredOn, CAST(0 AS DECIMAL(19, 4)), t.Amount
        FROM finance.Transactions t
        WHERE t.UserId = @UserId AND t.IsDeleted = 0 AND t.FromAccountId IS NOT NULL
    )
    SELECT a.Id AS AccountId,
           COALESCE(SUM(CASE WHEN m.OccurredOn >= a.OpeningDate AND m.OccurredOn <= @AsOf THEN m.MoneyIn END), 0) AS MoneyIn,
           COALESCE(SUM(CASE WHEN m.OccurredOn >= a.OpeningDate AND m.OccurredOn <= @AsOf THEN m.MoneyOut END), 0) AS MoneyOut,
           COUNT(m.AccountId) AS TransactionCount,
           MAX(m.OccurredOn) AS LastOn
    FROM finance.Accounts a
    LEFT JOIN Moves m ON m.AccountId = a.Id
    WHERE a.UserId = @UserId AND a.IsDeleted = 0
    GROUP BY a.Id;
END
GO
