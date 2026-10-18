USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Net worth (Session 58): what NetWorth (C#) needs from the ledger to rebuild any day's account balances and convert
-- other currencies — never stored. Accounts, holdings with their valuations and loans come through EF.
--
-- Set 1, one row per account per day money moved:
--   AccountId, Day, Net   (money in − money out that day; a cross-currency transfer arrives as its ToAmount)
-- Set 2, the manual rates typed on transactions, one per currency per day (the latest entered that day):
--   Currency, Day, Rate   (base-currency units per 1 Currency)
--
-- Every branch filters UserId/IsDeleted itself (EF's filters don't apply here).
CREATE OR ALTER PROCEDURE finance.GetNetWorthFacts
    @UserId INT
AS
BEGIN
    SET NOCOUNT ON;

    WITH Moves AS
    (
        SELECT t.ToAccountId AS AccountId, t.OccurredOn AS Day, COALESCE(t.ToAmount, t.Amount) AS Net
        FROM finance.Transactions t
        WHERE t.UserId = @UserId AND t.IsDeleted = 0 AND t.ToAccountId IS NOT NULL

        UNION ALL

        SELECT t.FromAccountId, t.OccurredOn, -t.Amount
        FROM finance.Transactions t
        WHERE t.UserId = @UserId AND t.IsDeleted = 0 AND t.FromAccountId IS NOT NULL
    )
    SELECT AccountId, Day, SUM(Net) AS Net
    FROM Moves
    GROUP BY AccountId, Day;

    WITH Rated AS
    (
        SELECT t.Currency, t.OccurredOn AS Day, t.ExchangeRate AS Rate,
               ROW_NUMBER() OVER (PARTITION BY t.Currency, t.OccurredOn ORDER BY t.Id DESC) AS Latest
        FROM finance.Transactions t
        WHERE t.UserId = @UserId AND t.IsDeleted = 0 AND t.ExchangeRate IS NOT NULL
    )
    SELECT Currency, Day, Rate
    FROM Rated
    WHERE Latest = 1;
END
GO
