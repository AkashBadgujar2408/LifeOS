USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Personal Finance (Phase 2, Sessions 55-59). Depends on 01_shared.sql (Users, Tags, Contacts) and 11_career.sql
-- (Employments, SideIncomeSources — what an income was for).
-- Where money sits (Accounts) and how it moves (Transactions, one row per movement — a transfer is one row with
-- both accounts), what repeats (RecurringTransactions), what you mean to spend (Budgets, per tag per month), what
-- you own and owe (Holdings with their valuations, Loans), what protects you (InsurancePolicies) and what the
-- taxman needs (TaxItems). Balances, outstanding loan amounts, budget usage and net worth are always computed,
-- never stored. Money is DECIMAL(19,4) + a 3-letter currency; reports use the user's BaseCurrency
-- (shared.Users) with a manual ExchangeRate on anything in another currency — no live rates. Categories are tags.

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'finance')
    EXEC('CREATE SCHEMA finance');
GO

-- A place money sits: a bank account, cash in hand, a wallet (UPI, PayPal), a card. OpeningBalance is what it
-- held on OpeningDate, before the first transaction recorded here (negative for a card that already owed).
-- NumberLast4 only — never a full account number. An archived account keeps its history but takes no new
-- transactions.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('finance.Accounts'))
BEGIN
    CREATE TABLE finance.Accounts
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Accounts PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Accounts_Users REFERENCES shared.Users(Id),
        Name            NVARCHAR(200)     NOT NULL CONSTRAINT CK_Accounts_Name CHECK (LEN(Name) > 0),
        Kind            NVARCHAR(10)      NOT NULL CONSTRAINT CK_Accounts_Kind CHECK (Kind IN ('Bank', 'Cash', 'Wallet', 'Card')),
        Institution     NVARCHAR(200)     NULL,
        NumberLast4     CHAR(4)           NULL     CONSTRAINT CK_Accounts_NumberLast4
                            CHECK (NumberLast4 COLLATE Latin1_General_BIN LIKE '[0-9A-Z][0-9A-Z][0-9A-Z][0-9A-Z]'),
        Currency        CHAR(3)           NOT NULL CONSTRAINT CK_Accounts_Currency
                            CHECK (Currency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        OpeningBalance  DECIMAL(19, 4)    NOT NULL CONSTRAINT DF_Accounts_OpeningBalance DEFAULT (0),
        OpeningDate     DATE              NOT NULL,
        IsArchived      BIT               NOT NULL CONSTRAINT DF_Accounts_IsArchived DEFAULT (0),
        Notes           NVARCHAR(2000)    NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Accounts_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Accounts_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('finance.Accounts') AND name = 'UX_Accounts_User_Name')
    CREATE UNIQUE INDEX UX_Accounts_User_Name ON finance.Accounts(UserId, Name) WHERE IsDeleted = 0;
GO

-- A schedule that writes transactions: salary, rent, an EMI, a subscription. "Every RecurrenceInterval
-- RecurrenceFrequency" counted from StartDate (the first occurrence); Until is the last day one may fall on.
-- GeneratedThrough is the last day already written (Session 57 writes every occurrence after it up to today,
-- then moves it), so deleting a generated transaction doesn't bring it back. The same kind/account rule as
-- Transactions. A paused schedule writes nothing until resumed.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('finance.RecurringTransactions'))
BEGIN
    CREATE TABLE finance.RecurringTransactions
    (
        Id                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RecurringTransactions PRIMARY KEY,
        UserId              INT               NOT NULL CONSTRAINT FK_RecurringTransactions_Users REFERENCES shared.Users(Id),
        Name                NVARCHAR(200)     NOT NULL CONSTRAINT CK_RecurringTransactions_Name CHECK (LEN(Name) > 0),
        Kind                NVARCHAR(10)      NOT NULL CONSTRAINT CK_RecurringTransactions_Kind CHECK (Kind IN ('Income', 'Expense', 'Transfer')),
        Amount              DECIMAL(19, 4)    NOT NULL CONSTRAINT CK_RecurringTransactions_Amount CHECK (Amount > 0),
        Currency            CHAR(3)           NOT NULL CONSTRAINT CK_RecurringTransactions_Currency
                                CHECK (Currency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        ExchangeRate        DECIMAL(19, 8)    NULL     CONSTRAINT CK_RecurringTransactions_ExchangeRate CHECK (ExchangeRate > 0),
        ToAmount            DECIMAL(19, 4)    NULL,
        FromAccountId       INT               NULL     CONSTRAINT FK_RecurringTransactions_FromAccount REFERENCES finance.Accounts(Id),
        ToAccountId         INT               NULL     CONSTRAINT FK_RecurringTransactions_ToAccount REFERENCES finance.Accounts(Id),
        Payee               NVARCHAR(200)     NULL,
        Note                NVARCHAR(1000)    NULL,
        RecurrenceFrequency NVARCHAR(10)      NOT NULL CONSTRAINT CK_RecurringTransactions_Frequency
                                CHECK (RecurrenceFrequency IN ('Daily', 'Weekly', 'Monthly', 'Yearly')),
        RecurrenceInterval  INT               NOT NULL CONSTRAINT DF_RecurringTransactions_Interval DEFAULT (1)
                                CONSTRAINT CK_RecurringTransactions_Interval CHECK (RecurrenceInterval BETWEEN 1 AND 999),
        StartDate           DATE              NOT NULL,
        Until               DATE              NULL,
        GeneratedThrough    DATE              NULL,
        IsPaused            BIT               NOT NULL CONSTRAINT DF_RecurringTransactions_IsPaused DEFAULT (0),
        CreatedAt           DATETIME2         NOT NULL CONSTRAINT DF_RecurringTransactions_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt           DATETIME2         NULL,
        IsDeleted           BIT               NOT NULL CONSTRAINT DF_RecurringTransactions_IsDeleted DEFAULT (0),
        DeletedAt           DATETIME2         NULL,
        CONSTRAINT CK_RecurringTransactions_Accounts CHECK (
            (Kind = 'Income' AND FromAccountId IS NULL AND ToAccountId IS NOT NULL)
            OR (Kind = 'Expense' AND FromAccountId IS NOT NULL AND ToAccountId IS NULL)
            OR (Kind = 'Transfer' AND FromAccountId IS NOT NULL AND ToAccountId IS NOT NULL AND FromAccountId <> ToAccountId)),
        CONSTRAINT CK_RecurringTransactions_ToAmount CHECK (ToAmount IS NULL OR (Kind = 'Transfer' AND ToAmount > 0)),
        CONSTRAINT CK_RecurringTransactions_Until CHECK (Until IS NULL OR Until >= StartDate)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('finance.RecurringTransactionTags'))
BEGIN
    CREATE TABLE finance.RecurringTransactionTags
    (
        Id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RecurringTransactionTags PRIMARY KEY,
        UserId                  INT               NOT NULL CONSTRAINT FK_RecurringTransactionTags_Users REFERENCES shared.Users(Id),
        RecurringTransactionId  INT               NOT NULL CONSTRAINT FK_RecurringTransactionTags_RecurringTransactions REFERENCES finance.RecurringTransactions(Id),
        TagId                   INT               NOT NULL CONSTRAINT FK_RecurringTransactionTags_Tags REFERENCES shared.Tags(Id),
        CreatedAt               DATETIME2         NOT NULL CONSTRAINT DF_RecurringTransactionTags_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt               DATETIME2         NULL,
        IsDeleted               BIT               NOT NULL CONSTRAINT DF_RecurringTransactionTags_IsDeleted DEFAULT (0),
        DeletedAt               DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('finance.RecurringTransactionTags') AND name = 'UX_RecurringTransactionTags_Recurring_Tag')
    CREATE UNIQUE INDEX UX_RecurringTransactionTags_Recurring_Tag ON finance.RecurringTransactionTags(RecurringTransactionId, TagId) WHERE IsDeleted = 0;
GO

-- Something you own that changes value: shares, a mutual fund, gold, PPF, a fixed deposit. Units and what was
-- put in are optional (a PPF has no units); its worth over time is HoldingValuations. DisposedOn: sold or
-- matured — it leaves net worth from then on but keeps its history. AccountId: where it's held or paid out to.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('finance.Holdings'))
BEGIN
    CREATE TABLE finance.Holdings
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Holdings PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Holdings_Users REFERENCES shared.Users(Id),
        Name            NVARCHAR(200)     NOT NULL CONSTRAINT CK_Holdings_Name CHECK (LEN(Name) > 0),
        Kind            NVARCHAR(20)      NOT NULL CONSTRAINT CK_Holdings_Kind
                            CHECK (Kind IN ('Stock', 'MutualFund', 'Gold', 'PPF', 'FD', 'Bond', 'Crypto', 'Property', 'Other')),
        Currency        CHAR(3)           NOT NULL CONSTRAINT CK_Holdings_Currency
                            CHECK (Currency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        Units           DECIMAL(19, 6)    NULL     CONSTRAINT CK_Holdings_Units CHECK (Units > 0),
        InvestedAmount  DECIMAL(19, 4)    NULL     CONSTRAINT CK_Holdings_InvestedAmount CHECK (InvestedAmount >= 0),
        InterestRate    DECIMAL(7, 4)     NULL     CONSTRAINT CK_Holdings_InterestRate CHECK (InterestRate BETWEEN 0 AND 100),
        AcquiredOn      DATE              NULL,
        MaturesOn       DATE              NULL,
        DisposedOn      DATE              NULL,
        AccountId       INT               NULL     CONSTRAINT FK_Holdings_Accounts REFERENCES finance.Accounts(Id),
        Notes           NVARCHAR(2000)    NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Holdings_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Holdings_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_Holdings_Matures CHECK (MaturesOn IS NULL OR AcquiredOn IS NULL OR MaturesOn >= AcquiredOn),
        CONSTRAINT CK_Holdings_Disposed CHECK (DisposedOn IS NULL OR AcquiredOn IS NULL OR DisposedOn >= AcquiredOn)
    );
END
GO

-- What a holding was worth on a day (entered by hand). The latest on or before a day is its value then.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('finance.HoldingValuations'))
BEGIN
    CREATE TABLE finance.HoldingValuations
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_HoldingValuations PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_HoldingValuations_Users REFERENCES shared.Users(Id),
        HoldingId       INT               NOT NULL CONSTRAINT FK_HoldingValuations_Holdings REFERENCES finance.Holdings(Id),
        ValuedOn        DATE              NOT NULL,
        Value           DECIMAL(19, 4)    NOT NULL CONSTRAINT CK_HoldingValuations_Value CHECK (Value >= 0),
        Note            NVARCHAR(1000)    NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_HoldingValuations_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_HoldingValuations_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('finance.HoldingValuations') AND name = 'UX_HoldingValuations_Holding_Day')
    CREATE UNIQUE INDEX UX_HoldingValuations_Holding_Day ON finance.HoldingValuations(HoldingId, ValuedOn) WHERE IsDeleted = 0;
GO

-- Money borrowed (a liability) or lent (an asset). Principal at AnnualRate % over TermMonths from StartDate;
-- EmiAmount is the lender's figure when given (else Session 58 computes it). What's still outstanding comes from
-- the amortisation schedule and the payments (transactions with this LoanId) — never stored. AccountId: where
-- the instalments are paid from (or into, when lent).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('finance.Loans'))
BEGIN
    CREATE TABLE finance.Loans
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Loans PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Loans_Users REFERENCES shared.Users(Id),
        Name            NVARCHAR(200)     NOT NULL CONSTRAINT CK_Loans_Name CHECK (LEN(Name) > 0),
        Kind            NVARCHAR(20)      NOT NULL CONSTRAINT CK_Loans_Kind
                            CHECK (Kind IN ('Home', 'Vehicle', 'Personal', 'Education', 'Gold', 'CreditCard', 'Other')),
        Direction       NVARCHAR(10)      NOT NULL CONSTRAINT DF_Loans_Direction DEFAULT ('Borrowed')
                            CONSTRAINT CK_Loans_Direction CHECK (Direction IN ('Borrowed', 'Lent')),
        Counterparty    NVARCHAR(200)     NULL,
        ContactId       INT               NULL     CONSTRAINT FK_Loans_Contacts REFERENCES shared.Contacts(Id),
        Principal       DECIMAL(19, 4)    NOT NULL CONSTRAINT CK_Loans_Principal CHECK (Principal > 0),
        Currency        CHAR(3)           NOT NULL CONSTRAINT CK_Loans_Currency
                            CHECK (Currency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        AnnualRate      DECIMAL(7, 4)     NOT NULL CONSTRAINT CK_Loans_AnnualRate CHECK (AnnualRate BETWEEN 0 AND 100),
        TermMonths      INT               NOT NULL CONSTRAINT CK_Loans_TermMonths CHECK (TermMonths BETWEEN 1 AND 600),
        StartDate       DATE              NOT NULL,
        EmiAmount       DECIMAL(19, 4)    NULL     CONSTRAINT CK_Loans_EmiAmount CHECK (EmiAmount > 0),
        AccountId       INT               NULL     CONSTRAINT FK_Loans_Accounts REFERENCES finance.Accounts(Id),
        ClosedOn        DATE              NULL,
        Notes           NVARCHAR(2000)    NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Loans_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Loans_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_Loans_Closed CHECK (ClosedOn IS NULL OR ClosedOn >= StartDate)
    );
END
GO

-- One movement of money on OccurredOn (the user's local day). Income lands in ToAccountId, an expense leaves
-- FromAccountId, a transfer is one row with both (different accounts) — so a transfer can never be half-recorded.
-- Amount (> 0) is in Currency, the moving account's currency (From for expense/transfer, To for income); a
-- transfer into an account in another currency also says what arrived (ToAmount). ExchangeRate = base-currency
-- units per 1 unit of Currency, given when Currency isn't the user's base (the service checks; the base can
-- change). An income may say what it was for (EmploymentId: salary; SideIncomeSourceId: a side income); any
-- kind may belong to a loan (an EMI paid, a loan received). RecurringTransactionId + OccurrenceDate: written by
-- a schedule for that day (one per schedule per day).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('finance.Transactions'))
BEGIN
    CREATE TABLE finance.Transactions
    (
        Id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Transactions PRIMARY KEY,
        UserId                  INT               NOT NULL CONSTRAINT FK_Transactions_Users REFERENCES shared.Users(Id),
        Kind                    NVARCHAR(10)      NOT NULL CONSTRAINT CK_Transactions_Kind CHECK (Kind IN ('Income', 'Expense', 'Transfer')),
        OccurredOn              DATE              NOT NULL,
        Amount                  DECIMAL(19, 4)    NOT NULL CONSTRAINT CK_Transactions_Amount CHECK (Amount > 0),
        Currency                CHAR(3)           NOT NULL CONSTRAINT CK_Transactions_Currency
                                    CHECK (Currency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        ExchangeRate            DECIMAL(19, 8)    NULL     CONSTRAINT CK_Transactions_ExchangeRate CHECK (ExchangeRate > 0),
        ToAmount                DECIMAL(19, 4)    NULL,
        FromAccountId           INT               NULL     CONSTRAINT FK_Transactions_FromAccount REFERENCES finance.Accounts(Id),
        ToAccountId             INT               NULL     CONSTRAINT FK_Transactions_ToAccount REFERENCES finance.Accounts(Id),
        Payee                   NVARCHAR(200)     NULL,
        Note                    NVARCHAR(1000)    NULL,
        Reference               NVARCHAR(100)     NULL,
        EmploymentId            INT               NULL     CONSTRAINT FK_Transactions_Employments REFERENCES career.Employments(Id),
        SideIncomeSourceId      INT               NULL     CONSTRAINT FK_Transactions_SideIncomeSources REFERENCES career.SideIncomeSources(Id),
        LoanId                  INT               NULL     CONSTRAINT FK_Transactions_Loans REFERENCES finance.Loans(Id),
        RecurringTransactionId  INT               NULL     CONSTRAINT FK_Transactions_RecurringTransactions REFERENCES finance.RecurringTransactions(Id),
        OccurrenceDate          DATE              NULL,
        CreatedAt               DATETIME2         NOT NULL CONSTRAINT DF_Transactions_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt               DATETIME2         NULL,
        IsDeleted               BIT               NOT NULL CONSTRAINT DF_Transactions_IsDeleted DEFAULT (0),
        DeletedAt               DATETIME2         NULL,
        CONSTRAINT CK_Transactions_Accounts CHECK (
            (Kind = 'Income' AND FromAccountId IS NULL AND ToAccountId IS NOT NULL)
            OR (Kind = 'Expense' AND FromAccountId IS NOT NULL AND ToAccountId IS NULL)
            OR (Kind = 'Transfer' AND FromAccountId IS NOT NULL AND ToAccountId IS NOT NULL AND FromAccountId <> ToAccountId)),
        CONSTRAINT CK_Transactions_ToAmount CHECK (ToAmount IS NULL OR (Kind = 'Transfer' AND ToAmount > 0)),
        CONSTRAINT CK_Transactions_IncomeSource CHECK (Kind = 'Income' OR (EmploymentId IS NULL AND SideIncomeSourceId IS NULL)),
        CONSTRAINT CK_Transactions_OneIncomeSource CHECK (EmploymentId IS NULL OR SideIncomeSourceId IS NULL),
        CONSTRAINT CK_Transactions_Occurrence CHECK (
            (RecurringTransactionId IS NULL AND OccurrenceDate IS NULL)
            OR (RecurringTransactionId IS NOT NULL AND OccurrenceDate IS NOT NULL))
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('finance.Transactions') AND name = 'IX_Transactions_User_Day')
    CREATE INDEX IX_Transactions_User_Day ON finance.Transactions(UserId, OccurredOn) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('finance.Transactions') AND name = 'IX_Transactions_FromAccount')
    CREATE INDEX IX_Transactions_FromAccount ON finance.Transactions(FromAccountId) INCLUDE (Amount) WHERE IsDeleted = 0 AND FromAccountId IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('finance.Transactions') AND name = 'IX_Transactions_ToAccount')
    CREATE INDEX IX_Transactions_ToAccount ON finance.Transactions(ToAccountId) INCLUDE (Amount, ToAmount) WHERE IsDeleted = 0 AND ToAccountId IS NOT NULL;
GO

-- A schedule writes at most one live transaction per occurrence (the safety net behind GeneratedThrough).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('finance.Transactions') AND name = 'UX_Transactions_Occurrence')
    CREATE UNIQUE INDEX UX_Transactions_Occurrence ON finance.Transactions(RecurringTransactionId, OccurrenceDate)
        WHERE IsDeleted = 0 AND RecurringTransactionId IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('finance.TransactionTags'))
BEGIN
    CREATE TABLE finance.TransactionTags
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TransactionTags PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_TransactionTags_Users REFERENCES shared.Users(Id),
        TransactionId   INT               NOT NULL CONSTRAINT FK_TransactionTags_Transactions REFERENCES finance.Transactions(Id),
        TagId           INT               NOT NULL CONSTRAINT FK_TransactionTags_Tags REFERENCES shared.Tags(Id),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_TransactionTags_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_TransactionTags_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('finance.TransactionTags') AND name = 'UX_TransactionTags_Transaction_Tag')
    CREATE UNIQUE INDEX UX_TransactionTags_Transaction_Tag ON finance.TransactionTags(TransactionId, TagId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('finance.TransactionTags') AND name = 'IX_TransactionTags_Tag')
    CREATE INDEX IX_TransactionTags_Tag ON finance.TransactionTags(TagId) WHERE IsDeleted = 0;
GO

-- What you mean to spend on a tag ("Groceries") in a month, in the base currency. Keyed by the month's first
-- day; one per tag per month (Session 57 copies a month's budgets forward on request rather than guessing).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('finance.Budgets'))
BEGIN
    CREATE TABLE finance.Budgets
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Budgets PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Budgets_Users REFERENCES shared.Users(Id),
        TagId           INT               NOT NULL CONSTRAINT FK_Budgets_Tags REFERENCES shared.Tags(Id),
        MonthStart      DATE              NOT NULL CONSTRAINT CK_Budgets_MonthStart CHECK (DAY(MonthStart) = 1),
        Amount          DECIMAL(19, 4)    NOT NULL CONSTRAINT CK_Budgets_Amount CHECK (Amount > 0),
        Currency        CHAR(3)           NOT NULL CONSTRAINT CK_Budgets_Currency
                            CHECK (Currency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Budgets_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Budgets_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('finance.Budgets') AND name = 'UX_Budgets_User_Tag_Month')
    CREATE UNIQUE INDEX UX_Budgets_User_Tag_Month ON finance.Budgets(UserId, TagId, MonthStart) WHERE IsDeleted = 0;
GO

-- A policy: life, health, vehicle, home, travel. Premium per PremiumFrequency (Single = paid once); RenewsOn is
-- the next renewal (Session 59 owns its reminder, like document expiry). PolicyNumberLast4 only. ContactId: the
-- agent. The policy document itself is a Documents item linked to it.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('finance.InsurancePolicies'))
BEGIN
    CREATE TABLE finance.InsurancePolicies
    (
        Id                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_InsurancePolicies PRIMARY KEY,
        UserId              INT               NOT NULL CONSTRAINT FK_InsurancePolicies_Users REFERENCES shared.Users(Id),
        Name                NVARCHAR(200)     NOT NULL CONSTRAINT CK_InsurancePolicies_Name CHECK (LEN(Name) > 0),
        Kind                NVARCHAR(20)      NOT NULL CONSTRAINT CK_InsurancePolicies_Kind
                                CHECK (Kind IN ('Life', 'Health', 'Vehicle', 'Home', 'Travel', 'Other')),
        Insurer             NVARCHAR(200)     NULL,
        PolicyNumberLast4   CHAR(4)           NULL     CONSTRAINT CK_InsurancePolicies_PolicyNumberLast4
                                CHECK (PolicyNumberLast4 COLLATE Latin1_General_BIN LIKE '[0-9A-Z][0-9A-Z][0-9A-Z][0-9A-Z]'),
        Currency            CHAR(3)           NOT NULL CONSTRAINT CK_InsurancePolicies_Currency
                                CHECK (Currency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        SumAssured          DECIMAL(19, 4)    NULL     CONSTRAINT CK_InsurancePolicies_SumAssured CHECK (SumAssured > 0),
        Premium             DECIMAL(19, 4)    NULL     CONSTRAINT CK_InsurancePolicies_Premium CHECK (Premium > 0),
        PremiumFrequency    NVARCHAR(10)      NULL     CONSTRAINT CK_InsurancePolicies_PremiumFrequency
                                CHECK (PremiumFrequency IN ('Monthly', 'Quarterly', 'HalfYearly', 'Yearly', 'Single')),
        StartDate           DATE              NULL,
        RenewsOn            DATE              NULL,
        EndsOn              DATE              NULL,
        ContactId           INT               NULL     CONSTRAINT FK_InsurancePolicies_Contacts REFERENCES shared.Contacts(Id),
        Notes               NVARCHAR(2000)    NULL,
        CreatedAt           DATETIME2         NOT NULL CONSTRAINT DF_InsurancePolicies_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt           DATETIME2         NULL,
        IsDeleted           BIT               NOT NULL CONSTRAINT DF_InsurancePolicies_IsDeleted DEFAULT (0),
        DeletedAt           DATETIME2         NULL,
        CONSTRAINT CK_InsurancePolicies_PremiumPair CHECK ((Premium IS NULL AND PremiumFrequency IS NULL) OR (Premium IS NOT NULL AND PremiumFrequency IS NOT NULL)),
        CONSTRAINT CK_InsurancePolicies_Ends CHECK (EndsOn IS NULL OR StartDate IS NULL OR EndsOn >= StartDate)
    );
END
GO

-- Something for the taxman: a filing deadline, a deduction to claim, a tax paid, a form to collect. TaxYear is the
-- user's own label ("FY 2026-27") since tax years differ by country. DueOn goes on the calendar (Session 59);
-- DoneOn marks it handled. TransactionId: the payment or deductible expense it's about.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('finance.TaxItems'))
BEGIN
    CREATE TABLE finance.TaxItems
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TaxItems PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_TaxItems_Users REFERENCES shared.Users(Id),
        Title           NVARCHAR(200)     NOT NULL CONSTRAINT CK_TaxItems_Title CHECK (LEN(Title) > 0),
        Kind            NVARCHAR(20)      NOT NULL CONSTRAINT CK_TaxItems_Kind
                            CHECK (Kind IN ('Deadline', 'Deduction', 'Payment', 'Document', 'Other')),
        TaxYear         NVARCHAR(20)      NULL,
        DueOn           DATE              NULL,
        Amount          DECIMAL(19, 4)    NULL     CONSTRAINT CK_TaxItems_Amount CHECK (Amount > 0),
        Currency        CHAR(3)           NULL     CONSTRAINT CK_TaxItems_Currency
                            CHECK (Currency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        IsDeductible    BIT               NOT NULL CONSTRAINT DF_TaxItems_IsDeductible DEFAULT (0),
        TransactionId   INT               NULL     CONSTRAINT FK_TaxItems_Transactions REFERENCES finance.Transactions(Id),
        DoneOn          DATE              NULL,
        Notes           NVARCHAR(2000)    NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_TaxItems_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_TaxItems_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_TaxItems_AmountPair CHECK ((Amount IS NULL AND Currency IS NULL) OR (Amount IS NOT NULL AND Currency IS NOT NULL))
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('finance.TaxItems') AND name = 'IX_TaxItems_User_Due')
    CREATE INDEX IX_TaxItems_User_Due ON finance.TaxItems(UserId, DueOn) WHERE IsDeleted = 0;
GO

-- Session 58a (asked for 2026-10-18): the exchange-rate master. "1 Currency = Rate BaseCurrency from EffectiveOn",
-- set by hand in Settings next to the base currency (no live rates). Kept as history, so a month end long ago uses
-- the rate of the time. BaseCurrency records which base it was set against: rows for an old base are ignored after
-- the base changes. Used to show other-currency balances, investments and loans in the base currency (account
-- totals, net worth, savings goals) and to prefill a transaction's rate; a transaction keeps the rate it was
-- entered with, so the ledger's figures never shift when a rate here changes.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('finance.ExchangeRates'))
BEGIN
    CREATE TABLE finance.ExchangeRates
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ExchangeRates PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_ExchangeRates_Users REFERENCES shared.Users(Id),
        Currency        CHAR(3)           NOT NULL CONSTRAINT CK_ExchangeRates_Currency
                            CHECK (Currency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        BaseCurrency    CHAR(3)           NOT NULL CONSTRAINT CK_ExchangeRates_BaseCurrency
                            CHECK (BaseCurrency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        Rate            DECIMAL(19, 8)    NOT NULL CONSTRAINT CK_ExchangeRates_Rate CHECK (Rate > 0),
        EffectiveOn     DATE              NOT NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_ExchangeRates_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_ExchangeRates_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_ExchangeRates_NotBase CHECK (Currency <> BaseCurrency)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('finance.ExchangeRates') AND name = 'UX_ExchangeRates_User_Pair_Day')
    CREATE UNIQUE INDEX UX_ExchangeRates_User_Pair_Day ON finance.ExchangeRates(UserId, Currency, BaseCurrency, EffectiveOn) WHERE IsDeleted = 0;
GO

-- Session 59 (Finance 5): a policy's renewal reminder works like a certification's — RenewalReminderDays (0-365)
-- before RenewsOn, one ordinary calendar.Reminders row kept in step by InsurancePoliciesService (only with a
-- renewal date).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('finance.InsurancePolicies') AND name = 'RenewalReminderDays')
    ALTER TABLE finance.InsurancePolicies ADD
        RenewalReminderDays INT NULL CONSTRAINT CK_InsurancePolicies_RenewalReminderDays CHECK (RenewalReminderDays BETWEEN 0 AND 365),
        RenewalReminderId   INT NULL CONSTRAINT FK_InsurancePolicies_Reminders REFERENCES calendar.Reminders(Id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_InsurancePolicies_Reminder')
    ALTER TABLE finance.InsurancePolicies ADD CONSTRAINT CK_InsurancePolicies_Reminder
        CHECK (RenewalReminderDays IS NULL OR RenewsOn IS NOT NULL);
GO

-- Session 59: a transaction imported from a bank statement remembers where it came from — SHA-256 (hex) of the
-- account, day, signed amount, cleaned description and which repeat of that line it was within the file — so
-- importing the same statement again adds nothing. The unique index deliberately includes deleted rows: an
-- imported line you deleted doesn't come back with the next import.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('finance.Transactions') AND name = 'ImportHash')
    ALTER TABLE finance.Transactions ADD
        ImportHash CHAR(64) NULL CONSTRAINT CK_Transactions_ImportHash
            CHECK (ImportHash COLLATE Latin1_General_BIN NOT LIKE '%[^0-9a-f]%' AND LEN(ImportHash) = 64);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('finance.Transactions') AND name = 'UX_Transactions_User_ImportHash')
    CREATE UNIQUE INDEX UX_Transactions_User_ImportHash ON finance.Transactions(UserId, ImportHash) WHERE ImportHash IS NOT NULL;
GO

-- Session 60 (export/import): what a statement line's ImportHash is computed from must survive an export → import
-- into another account, where every id changes — so the account part of the hash is this stable key, not its id.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('finance.Accounts') AND name = 'ImportKey')
    ALTER TABLE finance.Accounts ADD
        ImportKey UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Accounts_ImportKey DEFAULT (NEWID());
GO

-- Session 61 (asked for 2026-10-18): multi-currency accounts — PayPal or Wise holding USD, GBP and EUR in one
-- account. Accounts.Currency stays the account's main currency (with OpeningBalance); each extra currency it holds is
-- a row here with its own opening balance (as of the account's OpeningDate). An account with no rows here is a
-- single-currency account, exactly as before. Balances stay computed, per account per currency.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('finance.AccountCurrencies'))
BEGIN
    CREATE TABLE finance.AccountCurrencies
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AccountCurrencies PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_AccountCurrencies_Users REFERENCES shared.Users(Id),
        AccountId       INT               NOT NULL CONSTRAINT FK_AccountCurrencies_Accounts REFERENCES finance.Accounts(Id),
        Currency        CHAR(3)           NOT NULL CONSTRAINT CK_AccountCurrencies_Currency
                            CHECK (Currency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        OpeningBalance  DECIMAL(19, 4)    NOT NULL CONSTRAINT DF_AccountCurrencies_OpeningBalance DEFAULT (0),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_AccountCurrencies_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_AccountCurrencies_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('finance.AccountCurrencies') AND name = 'UX_AccountCurrencies_Account_Currency')
    CREATE UNIQUE INDEX UX_AccountCurrencies_Account_Currency ON finance.AccountCurrencies(AccountId, Currency) WHERE IsDeleted = 0;
GO

-- Session 61: what arrived is now said in its own currency (ToCurrency), since a multi-currency account can receive
-- in any of its currencies. Both or neither with ToAmount; NULL = it arrived as it left (same amount, same currency).
-- Rows from before carried ToAmount in the receiving account's currency, which is what the backfill writes.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('finance.Transactions') AND name = 'ToCurrency')
    ALTER TABLE finance.Transactions ADD
        ToCurrency CHAR(3) NULL CONSTRAINT CK_Transactions_ToCurrency
            CHECK (ToCurrency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]');
GO

UPDATE t SET ToCurrency = a.Currency
FROM finance.Transactions t
JOIN finance.Accounts a ON a.Id = t.ToAccountId
WHERE t.ToAmount IS NOT NULL AND t.ToCurrency IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Transactions_ToPair')
    ALTER TABLE finance.Transactions ADD CONSTRAINT CK_Transactions_ToPair
        CHECK ((ToAmount IS NULL AND ToCurrency IS NULL) OR (ToAmount IS NOT NULL AND ToCurrency IS NOT NULL AND ToCurrency <> Currency));
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('finance.RecurringTransactions') AND name = 'ToCurrency')
    ALTER TABLE finance.RecurringTransactions ADD
        ToCurrency CHAR(3) NULL CONSTRAINT CK_RecurringTransactions_ToCurrency
            CHECK (ToCurrency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]');
GO

UPDATE r SET ToCurrency = a.Currency
FROM finance.RecurringTransactions r
JOIN finance.Accounts a ON a.Id = r.ToAccountId
WHERE r.ToAmount IS NOT NULL AND r.ToCurrency IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_RecurringTransactions_ToPair')
    ALTER TABLE finance.RecurringTransactions ADD CONSTRAINT CK_RecurringTransactions_ToPair
        CHECK ((ToAmount IS NULL AND ToCurrency IS NULL) OR (ToAmount IS NOT NULL AND ToCurrency IS NOT NULL AND ToCurrency <> Currency));
GO

-- Session 68b: loans rework. Every loan movement is a transaction: the money that changed hands at the start
-- (IsLoanDisbursement — one per loan) and each repayment (a transaction with LoanId). Outstanding is
-- worked out from those actual payments (LoanLedger), never stored. RepaymentKind: Emi = a fixed monthly instalment
-- over TermMonths (the schedule); Flexible = pay as you go, no term, no instalment. AnnualRate 0 = interest-free.
-- AssumedPaidThrough (EMI only): instalments due on or before it count as paid, so an old loan doesn't need years of
-- past payments typed in; loans from before this session get the day of the upgrade, so their figures don't change.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('finance.Loans') AND name = 'RepaymentKind')
BEGIN
    ALTER TABLE finance.Loans ADD
        RepaymentKind NVARCHAR(10) NOT NULL CONSTRAINT DF_Loans_RepaymentKind DEFAULT ('Emi')
                                            CONSTRAINT CK_Loans_RepaymentKind CHECK (RepaymentKind IN ('Emi', 'Flexible')),
        AssumedPaidThrough DATE NULL;
    -- Once, with the columns: the loans that existed keep "every instalment due so far was paid".
    EXEC ('UPDATE finance.Loans SET AssumedPaidThrough = CAST(SYSUTCDATETIME() AS DATE) WHERE StartDate <= CAST(SYSUTCDATETIME() AS DATE)');
END
GO

-- A flexible loan has no term: TermMonths becomes optional (the CHECK has to be dropped around the change).
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('finance.Loans') AND name = 'TermMonths' AND is_nullable = 0)
BEGIN
    ALTER TABLE finance.Loans DROP CONSTRAINT CK_Loans_TermMonths;
    ALTER TABLE finance.Loans ALTER COLUMN TermMonths INT NULL;
    ALTER TABLE finance.Loans ADD CONSTRAINT CK_Loans_TermMonths CHECK (TermMonths BETWEEN 1 AND 600);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Loans_RepaymentShape')
    ALTER TABLE finance.Loans ADD CONSTRAINT CK_Loans_RepaymentShape CHECK (
        (RepaymentKind = 'Emi' AND TermMonths IS NOT NULL)
        OR (RepaymentKind = 'Flexible' AND TermMonths IS NULL AND EmiAmount IS NULL AND AssumedPaidThrough IS NULL));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Loans_AssumedPaidThrough')
    ALTER TABLE finance.Loans ADD CONSTRAINT CK_Loans_AssumedPaidThrough
        CHECK (AssumedPaidThrough IS NULL OR AssumedPaidThrough >= StartDate);
GO

-- The money that changed hands at the start is the loan's one transaction marked IsLoanDisbursement (unique per loan).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('finance.Transactions') AND name = 'IsLoanDisbursement')
    ALTER TABLE finance.Transactions ADD
        IsLoanDisbursement BIT NOT NULL CONSTRAINT DF_Transactions_IsLoanDisbursement DEFAULT (0);
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Transactions_LoanDisbursement')
    ALTER TABLE finance.Transactions ADD CONSTRAINT CK_Transactions_LoanDisbursement
        CHECK (IsLoanDisbursement = 0 OR LoanId IS NOT NULL);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('finance.Transactions') AND name = 'UX_Transactions_LoanDisbursement')
    CREATE UNIQUE INDEX UX_Transactions_LoanDisbursement ON finance.Transactions(LoanId, IsLoanDisbursement)
        WHERE IsDeleted = 0 AND IsLoanDisbursement = 1;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('finance.Transactions') AND name = 'IX_Transactions_Loan')
    CREATE INDEX IX_Transactions_Loan ON finance.Transactions(LoanId, OccurredOn) WHERE IsDeleted = 0 AND LoanId IS NOT NULL;
GO

-- Session 71b: the assumptions behind savings and retirement projections — one row per user, rewritten in place.
-- Everything projected from them (needed per month, corpus needed, projected corpus, the age it's reached) is
-- computed by FinancialPlan, never stored. BirthDate: only when Health has no date of birth. MonthlySpending: today's
-- money, in the base currency. MonthlySaving: typed to override the last three months' actual saving.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('finance.PlanAssumptions'))
BEGIN
    CREATE TABLE finance.PlanAssumptions
    (
        Id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PlanAssumptions PRIMARY KEY,
        UserId                  INT               NOT NULL CONSTRAINT FK_PlanAssumptions_Users REFERENCES shared.Users(Id),
        ExpectedReturnPercent   DECIMAL(5, 2)     NOT NULL CONSTRAINT CK_PlanAssumptions_Return CHECK (ExpectedReturnPercent BETWEEN 0 AND 30),
        InflationPercent        DECIMAL(5, 2)     NOT NULL CONSTRAINT CK_PlanAssumptions_Inflation CHECK (InflationPercent BETWEEN 0 AND 30),
        BirthDate               DATE              NULL,
        RetirementAge           INT               NOT NULL CONSTRAINT CK_PlanAssumptions_RetirementAge CHECK (RetirementAge BETWEEN 30 AND 100),
        YearsInRetirement       INT               NOT NULL CONSTRAINT CK_PlanAssumptions_Years CHECK (YearsInRetirement BETWEEN 1 AND 60),
        MonthlySpending         DECIMAL(19, 4)    NULL     CONSTRAINT CK_PlanAssumptions_Spending CHECK (MonthlySpending > 0),
        MonthlySaving           DECIMAL(19, 4)    NULL     CONSTRAINT CK_PlanAssumptions_Saving CHECK (MonthlySaving >= 0),
        CreatedAt               DATETIME2         NOT NULL CONSTRAINT DF_PlanAssumptions_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt               DATETIME2         NULL,
        IsDeleted               BIT               NOT NULL CONSTRAINT DF_PlanAssumptions_IsDeleted DEFAULT (0),
        DeletedAt               DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('finance.PlanAssumptions') AND name = 'UX_PlanAssumptions_User')
    CREATE UNIQUE INDEX UX_PlanAssumptions_User ON finance.PlanAssumptions(UserId) WHERE IsDeleted = 0;
GO

-- Session 71c added "Can I afford it?" scenarios (finance.Scenarios + finance.ScenarioLines); Session 96a removed the
-- module at your request. Dropped here so the script stays re-runnable on a database that still has them (UAT backed
-- up first: LifeOS_UAT_pre96a.bak).
IF OBJECT_ID('finance.ScenarioLines') IS NOT NULL
    DROP TABLE finance.ScenarioLines;
GO

IF OBJECT_ID('finance.Scenarios') IS NOT NULL
    DROP TABLE finance.Scenarios;
GO
