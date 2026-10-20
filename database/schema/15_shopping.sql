USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Purchases, Shopping & Subscriptions (Phase 3, Sessions 69-71, + Rewards & vouchers 70a). Depends on
-- 01_shared.sql (Users, Tags), 04_calendar.sql (Reminders), 12_finance.sql (Accounts, Transactions,
-- RecurringTransactions) and 14_home.sql (Assets — what a purchase became).
-- Every movement of money here is a Finance transaction (stored once, unique TransactionId): a purchase's expense, a
-- refund's income, cashback received, points cashed in; a subscription with an account owns a Finance repeating
-- transaction, so each charge is written by the schedule. Everything "left", "next" or "expiring" is computed, never
-- stored: a voucher's balance (value − redemptions), a subscription's next charge, points still valid.
-- Money is DECIMAL(19,4) + a 3-letter currency, as in Finance. Voucher codes and PINs are encrypted at rest
-- (columns named …Secret, SensitiveColumns): CK_…_SecretsEncrypted makes sure plain text never lands there.

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'shopping')
    EXEC('CREATE SCHEMA shopping');
GO

-- A list of things to buy ("Groceries", "Diwali"). Archived lists keep their history.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('shopping.ShoppingLists'))
BEGIN
    CREATE TABLE shopping.ShoppingLists
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ShoppingLists PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_ShoppingLists_Users REFERENCES shared.Users(Id),
        Name            NVARCHAR(200)     NOT NULL CONSTRAINT CK_ShoppingLists_Name CHECK (LEN(Name) > 0),
        IsArchived      BIT               NOT NULL CONSTRAINT DF_ShoppingLists_IsArchived DEFAULT (0),
        Notes           NVARCHAR(2000)    NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_ShoppingLists_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_ShoppingLists_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shopping.ShoppingLists') AND name = 'UX_ShoppingLists_User_Name')
    CREATE UNIQUE INDEX UX_ShoppingLists_User_Name ON shopping.ShoppingLists(UserId, Name) WHERE IsDeleted = 0;
GO

-- A purchase: what was bought, where, when and for how much (Amount = what was actually paid in money, after any
-- voucher/coupon; EstimatedAmount = what it was expected to cost, for estimate vs actual). TransactionId: the Finance
-- expense it was paid with (unique — recorded once). AssetId: what it became in the Home inventory.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('shopping.Purchases'))
BEGIN
    CREATE TABLE shopping.Purchases
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Purchases PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Purchases_Users REFERENCES shared.Users(Id),
        Title           NVARCHAR(200)     NOT NULL CONSTRAINT CK_Purchases_Title CHECK (LEN(Title) > 0),
        Store           NVARCHAR(200)     NULL     CONSTRAINT CK_Purchases_Store CHECK (LEN(Store) > 0),
        PurchasedOn     DATE              NOT NULL,
        Amount          DECIMAL(19, 4)    NOT NULL CONSTRAINT CK_Purchases_Amount CHECK (Amount >= 0),
        EstimatedAmount DECIMAL(19, 4)    NULL     CONSTRAINT CK_Purchases_EstimatedAmount CHECK (EstimatedAmount >= 0),
        Currency        CHAR(3)           NOT NULL CONSTRAINT CK_Purchases_Currency
                            CHECK (Currency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        TransactionId   INT               NULL     CONSTRAINT FK_Purchases_Transactions REFERENCES finance.Transactions(Id),
        AssetId         INT               NULL     CONSTRAINT FK_Purchases_Assets REFERENCES home.Assets(Id),
        Notes           NVARCHAR(2000)    NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Purchases_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Purchases_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shopping.Purchases') AND name = 'IX_Purchases_User_On')
    CREATE INDEX IX_Purchases_User_On ON shopping.Purchases(UserId, PurchasedOn) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shopping.Purchases') AND name = 'UX_Purchases_Transaction')
    CREATE UNIQUE INDEX UX_Purchases_Transaction ON shopping.Purchases(TransactionId) WHERE IsDeleted = 0 AND TransactionId IS NOT NULL;
GO

-- Categories of a purchase are tags (also given to its expense).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('shopping.PurchaseTags'))
BEGIN
    CREATE TABLE shopping.PurchaseTags
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PurchaseTags PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_PurchaseTags_Users REFERENCES shared.Users(Id),
        PurchaseId      INT               NOT NULL CONSTRAINT FK_PurchaseTags_Purchases REFERENCES shopping.Purchases(Id),
        TagId           INT               NOT NULL CONSTRAINT FK_PurchaseTags_Tags REFERENCES shared.Tags(Id),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_PurchaseTags_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_PurchaseTags_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shopping.PurchaseTags') AND name = 'UX_PurchaseTags_Purchase_Tag')
    CREATE UNIQUE INDEX UX_PurchaseTags_Purchase_Tag ON shopping.PurchaseTags(PurchaseId, TagId) WHERE IsDeleted = 0;
GO

-- A thing on a shopping list. Ticked off (DoneAt) when it's in the basket; PurchaseId once it was recorded as (part of)
-- a purchase. EstimatedPrice is for the whole line.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('shopping.ShoppingListItems'))
BEGIN
    CREATE TABLE shopping.ShoppingListItems
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ShoppingListItems PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_ShoppingListItems_Users REFERENCES shared.Users(Id),
        ListId          INT               NOT NULL CONSTRAINT FK_ShoppingListItems_Lists REFERENCES shopping.ShoppingLists(Id),
        Name            NVARCHAR(200)     NOT NULL CONSTRAINT CK_ShoppingListItems_Name CHECK (LEN(Name) > 0),
        Quantity        NVARCHAR(50)      NULL,
        EstimatedPrice  DECIMAL(19, 4)    NULL     CONSTRAINT CK_ShoppingListItems_EstimatedPrice CHECK (EstimatedPrice >= 0),
        Currency        CHAR(3)           NULL     CONSTRAINT CK_ShoppingListItems_Currency
                            CHECK (Currency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        SortOrder       INT               NOT NULL CONSTRAINT DF_ShoppingListItems_SortOrder DEFAULT (0),
        DoneAt          DATETIME2         NULL,
        PurchaseId      INT               NULL     CONSTRAINT FK_ShoppingListItems_Purchases REFERENCES shopping.Purchases(Id),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_ShoppingListItems_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_ShoppingListItems_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_ShoppingListItems_PricePair CHECK (EstimatedPrice IS NULL OR Currency IS NOT NULL),
        CONSTRAINT CK_ShoppingListItems_PurchaseDone CHECK (PurchaseId IS NULL OR DoneAt IS NOT NULL)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shopping.ShoppingListItems') AND name = 'IX_ShoppingListItems_List')
    CREATE INDEX IX_ShoppingListItems_List ON shopping.ShoppingListItems(ListId, SortOrder) WHERE IsDeleted = 0;
GO

-- Something you'd like one day: where to get it, what it costs now, the price you'd pay (TargetPrice), how much you
-- want it. PurchaseId once it's bought (it leaves the wishlist, keeps its history).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('shopping.WishlistItems'))
BEGIN
    CREATE TABLE shopping.WishlistItems
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_WishlistItems PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_WishlistItems_Users REFERENCES shared.Users(Id),
        Name            NVARCHAR(200)     NOT NULL CONSTRAINT CK_WishlistItems_Name CHECK (LEN(Name) > 0),
        Store           NVARCHAR(200)     NULL,
        Url             NVARCHAR(500)     NULL     CONSTRAINT CK_WishlistItems_Url CHECK (Url LIKE 'http://%' OR Url LIKE 'https://%'),
        Price           DECIMAL(19, 4)    NULL     CONSTRAINT CK_WishlistItems_Price CHECK (Price >= 0),
        TargetPrice     DECIMAL(19, 4)    NULL     CONSTRAINT CK_WishlistItems_TargetPrice CHECK (TargetPrice >= 0),
        Currency        CHAR(3)           NULL     CONSTRAINT CK_WishlistItems_Currency
                            CHECK (Currency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        Priority        NVARCHAR(10)      NOT NULL CONSTRAINT DF_WishlistItems_Priority DEFAULT ('Medium')
                            CONSTRAINT CK_WishlistItems_Priority CHECK (Priority IN ('Low', 'Medium', 'High')),
        PurchaseId      INT               NULL     CONSTRAINT FK_WishlistItems_Purchases REFERENCES shopping.Purchases(Id),
        Notes           NVARCHAR(2000)    NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_WishlistItems_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_WishlistItems_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_WishlistItems_PricePair CHECK ((Price IS NULL AND TargetPrice IS NULL) OR Currency IS NOT NULL)
    );
END
GO

-- Something paid again and again: streaming, cloud storage, a gym. Charged every RecurrenceInterval
-- RecurrenceFrequency from StartedOn (the first charge); the next charge is computed. With an account it owns a
-- Finance repeating transaction (RecurringTransactionId, unique) that writes each charge to the ledger. CancelBy: the
-- day to decide by (a trial's end, the last day before a renewal). Cancelled = no more charges from CancelledOn.
-- The renewal reminder (N days before each charge) is owned by the service.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('shopping.Subscriptions'))
BEGIN
    CREATE TABLE shopping.Subscriptions
    (
        Id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Subscriptions PRIMARY KEY,
        UserId                  INT               NOT NULL CONSTRAINT FK_Subscriptions_Users REFERENCES shared.Users(Id),
        Name                    NVARCHAR(200)     NOT NULL CONSTRAINT CK_Subscriptions_Name CHECK (LEN(Name) > 0),
        Provider                NVARCHAR(200)     NULL,
        Amount                  DECIMAL(19, 4)    NOT NULL CONSTRAINT CK_Subscriptions_Amount CHECK (Amount > 0),
        Currency                CHAR(3)           NOT NULL CONSTRAINT CK_Subscriptions_Currency
                                    CHECK (Currency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        RecurrenceFrequency     NVARCHAR(10)      NOT NULL CONSTRAINT CK_Subscriptions_Frequency
                                    CHECK (RecurrenceFrequency IN ('Weekly', 'Monthly', 'Yearly')),
        RecurrenceInterval      INT               NOT NULL CONSTRAINT DF_Subscriptions_Interval DEFAULT (1)
                                    CONSTRAINT CK_Subscriptions_Interval CHECK (RecurrenceInterval BETWEEN 1 AND 99),
        StartedOn               DATE              NOT NULL,
        Status                  NVARCHAR(10)      NOT NULL CONSTRAINT DF_Subscriptions_Status DEFAULT ('Active')
                                    CONSTRAINT CK_Subscriptions_Status CHECK (Status IN ('Active', 'Paused', 'Cancelled')),
        CancelledOn             DATE              NULL,
        CancelBy                DATE              NULL,
        AccountId               INT               NULL     CONSTRAINT FK_Subscriptions_Accounts REFERENCES finance.Accounts(Id),
        RecurringTransactionId  INT               NULL     CONSTRAINT FK_Subscriptions_RecurringTransactions REFERENCES finance.RecurringTransactions(Id),
        ReminderDays            INT               NULL     CONSTRAINT CK_Subscriptions_ReminderDays CHECK (ReminderDays BETWEEN 0 AND 365),
        ReminderId              INT               NULL     CONSTRAINT FK_Subscriptions_Reminders REFERENCES calendar.Reminders(Id),
        Notes                   NVARCHAR(2000)    NULL,
        CreatedAt               DATETIME2         NOT NULL CONSTRAINT DF_Subscriptions_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt               DATETIME2         NULL,
        IsDeleted               BIT               NOT NULL CONSTRAINT DF_Subscriptions_IsDeleted DEFAULT (0),
        DeletedAt               DATETIME2         NULL,
        CONSTRAINT CK_Subscriptions_Cancelled CHECK ((Status = 'Cancelled' AND CancelledOn IS NOT NULL) OR (Status <> 'Cancelled' AND CancelledOn IS NULL)),
        CONSTRAINT CK_Subscriptions_CancelledAfterStart CHECK (CancelledOn IS NULL OR CancelledOn >= StartedOn),
        CONSTRAINT CK_Subscriptions_Schedule CHECK (RecurringTransactionId IS NULL OR AccountId IS NOT NULL)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shopping.Subscriptions') AND name = 'UX_Subscriptions_RecurringTransaction')
    CREATE UNIQUE INDEX UX_Subscriptions_RecurringTransaction ON shopping.Subscriptions(RecurringTransactionId)
        WHERE IsDeleted = 0 AND RecurringTransactionId IS NOT NULL;
GO

-- Taking something back: return it by ReturnBy (the shop's deadline; a reminder before it is owned by the service),
-- ReturnedOn when it went back, the refund expected / received. RefundTransactionId: the Finance income the refund
-- arrived as (unique — recorded once). State (open / returned / refunded / missed) is computed.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('shopping.Returns'))
BEGIN
    CREATE TABLE shopping.Returns
    (
        Id                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Returns PRIMARY KEY,
        UserId              INT               NOT NULL CONSTRAINT FK_Returns_Users REFERENCES shared.Users(Id),
        PurchaseId          INT               NOT NULL CONSTRAINT FK_Returns_Purchases REFERENCES shopping.Purchases(Id),
        Reason              NVARCHAR(500)     NULL,
        ReturnBy            DATE              NULL,
        ReturnedOn          DATE              NULL,
        RefundAmount        DECIMAL(19, 4)    NULL     CONSTRAINT CK_Returns_RefundAmount CHECK (RefundAmount > 0),
        RefundedOn          DATE              NULL,
        RefundTransactionId INT               NULL     CONSTRAINT FK_Returns_Transactions REFERENCES finance.Transactions(Id),
        ReminderDays        INT               NULL     CONSTRAINT CK_Returns_ReminderDays CHECK (ReminderDays BETWEEN 0 AND 365),
        ReminderId          INT               NULL     CONSTRAINT FK_Returns_Reminders REFERENCES calendar.Reminders(Id),
        Notes               NVARCHAR(2000)    NULL,
        CreatedAt           DATETIME2         NOT NULL CONSTRAINT DF_Returns_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt           DATETIME2         NULL,
        IsDeleted           BIT               NOT NULL CONSTRAINT DF_Returns_IsDeleted DEFAULT (0),
        DeletedAt           DATETIME2         NULL,
        CONSTRAINT CK_Returns_Refunded CHECK (RefundedOn IS NULL OR RefundAmount IS NOT NULL),
        CONSTRAINT CK_Returns_RefundTransaction CHECK (RefundTransactionId IS NULL OR RefundedOn IS NOT NULL)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shopping.Returns') AND name = 'UX_Returns_Purchase')
    CREATE UNIQUE INDEX UX_Returns_Purchase ON shopping.Returns(PurchaseId, IsDeleted) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shopping.Returns') AND name = 'UX_Returns_RefundTransaction')
    CREATE UNIQUE INDEX UX_Returns_RefundTransaction ON shopping.Returns(RefundTransactionId)
        WHERE IsDeleted = 0 AND RefundTransactionId IS NOT NULL;
GO

-- Rewards & vouchers (Session 70a): anything that saves or earns money later.
--   Voucher / GiftCard / StoreCredit — Value at a Store, used up by redemptions (balance computed);
--   Coupon — a % (DiscountPercent) or flat (Value) off, MinSpend, used once;
--   Cashback — Value expected from a purchase by ExpectedBy; ReceivedOn + TransactionId (one Finance income) when it lands;
--   Points — a programme (Store) with ValuePerPoint, earned in PointBatches (each may expire), spent in redemptions;
--   WalletCredit — promotional money in a Finance wallet (AccountId), usually expiring.
-- CodeSecret / PinSecret are encrypted at rest. The expiry reminder is owned by the service.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('shopping.Benefits'))
BEGIN
    CREATE TABLE shopping.Benefits
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Benefits PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Benefits_Users REFERENCES shared.Users(Id),
        Kind            NVARCHAR(15)      NOT NULL CONSTRAINT CK_Benefits_Kind
                            CHECK (Kind IN ('Voucher', 'GiftCard', 'StoreCredit', 'Coupon', 'Cashback', 'Points', 'WalletCredit')),
        Name            NVARCHAR(200)     NOT NULL CONSTRAINT CK_Benefits_Name CHECK (LEN(Name) > 0),
        Store           NVARCHAR(200)     NULL     CONSTRAINT CK_Benefits_Store CHECK (LEN(Store) > 0),
        Value           DECIMAL(19, 4)    NULL     CONSTRAINT CK_Benefits_Value CHECK (Value > 0),
        Currency        CHAR(3)           NULL     CONSTRAINT CK_Benefits_Currency
                            CHECK (Currency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        DiscountPercent DECIMAL(5, 2)     NULL     CONSTRAINT CK_Benefits_DiscountPercent CHECK (DiscountPercent > 0 AND DiscountPercent <= 100),
        MinSpend        DECIMAL(19, 4)    NULL     CONSTRAINT CK_Benefits_MinSpend CHECK (MinSpend > 0),
        ValuePerPoint   DECIMAL(19, 6)    NULL     CONSTRAINT CK_Benefits_ValuePerPoint CHECK (ValuePerPoint > 0),
        CodeSecret      NVARCHAR(MAX)     NULL,
        PinSecret       NVARCHAR(MAX)     NULL,
        ExpiresOn       DATE              NULL,
        ReminderDays    INT               NULL     CONSTRAINT CK_Benefits_ReminderDays CHECK (ReminderDays BETWEEN 0 AND 365),
        ReminderId      INT               NULL     CONSTRAINT FK_Benefits_Reminders REFERENCES calendar.Reminders(Id),
        PurchaseId      INT               NULL     CONSTRAINT FK_Benefits_Purchases REFERENCES shopping.Purchases(Id),
        AccountId       INT               NULL     CONSTRAINT FK_Benefits_Accounts REFERENCES finance.Accounts(Id),
        ExpectedBy      DATE              NULL,
        ReceivedOn      DATE              NULL,
        TransactionId   INT               NULL     CONSTRAINT FK_Benefits_Transactions REFERENCES finance.Transactions(Id),
        Notes           NVARCHAR(2000)    NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Benefits_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Benefits_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_Benefits_SecretsEncrypted CHECK ((CodeSecret IS NULL OR CodeSecret LIKE 'CfDJ8%') AND (PinSecret IS NULL OR PinSecret LIKE 'CfDJ8%')),
        CONSTRAINT CK_Benefits_ValuePair CHECK ((Value IS NULL AND MinSpend IS NULL) OR Currency IS NOT NULL),
        -- What each kind needs: money with a value; a coupon is % or flat; points need a programme and a point value;
        -- wallet credit lives in a wallet account.
        CONSTRAINT CK_Benefits_Shape CHECK (
            (Kind IN ('Voucher', 'GiftCard', 'StoreCredit', 'Cashback') AND Value IS NOT NULL AND DiscountPercent IS NULL AND ValuePerPoint IS NULL)
            OR (Kind = 'Coupon' AND ((Value IS NULL AND DiscountPercent IS NOT NULL) OR (Value IS NOT NULL AND DiscountPercent IS NULL)) AND ValuePerPoint IS NULL)
            OR (Kind = 'Points' AND Store IS NOT NULL AND ValuePerPoint IS NOT NULL AND Currency IS NOT NULL AND Value IS NULL AND DiscountPercent IS NULL)
            OR (Kind = 'WalletCredit' AND Value IS NOT NULL AND AccountId IS NOT NULL AND DiscountPercent IS NULL AND ValuePerPoint IS NULL)),
        -- Only cashback is received, and received means a day.
        CONSTRAINT CK_Benefits_Cashback CHECK (Kind = 'Cashback' OR (ExpectedBy IS NULL AND ReceivedOn IS NULL AND TransactionId IS NULL)),
        CONSTRAINT CK_Benefits_Received CHECK (TransactionId IS NULL OR ReceivedOn IS NOT NULL)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shopping.Benefits') AND name = 'UX_Benefits_Transaction')
    CREATE UNIQUE INDEX UX_Benefits_Transaction ON shopping.Benefits(TransactionId) WHERE IsDeleted = 0 AND TransactionId IS NOT NULL;
GO

-- Using a benefit: an amount of money (vouchers, credit, coupons — the saving) or points, on a day, optionally on a
-- purchase. Points cashed into money carry the Finance income they became (TransactionId, unique). The balance left
-- (value − amounts used, points earned and still valid − points used) is computed; the service refuses going below
-- zero and a coupon used twice (CHECKs can't see other rows).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('shopping.BenefitRedemptions'))
BEGIN
    CREATE TABLE shopping.BenefitRedemptions
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_BenefitRedemptions PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_BenefitRedemptions_Users REFERENCES shared.Users(Id),
        BenefitId       INT               NOT NULL CONSTRAINT FK_BenefitRedemptions_Benefits REFERENCES shopping.Benefits(Id),
        RedeemedOn      DATE              NOT NULL,
        Amount          DECIMAL(19, 4)    NULL     CONSTRAINT CK_BenefitRedemptions_Amount CHECK (Amount > 0),
        Points          INT               NULL     CONSTRAINT CK_BenefitRedemptions_Points CHECK (Points > 0),
        PurchaseId      INT               NULL     CONSTRAINT FK_BenefitRedemptions_Purchases REFERENCES shopping.Purchases(Id),
        TransactionId   INT               NULL     CONSTRAINT FK_BenefitRedemptions_Transactions REFERENCES finance.Transactions(Id),
        Notes           NVARCHAR(500)     NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_BenefitRedemptions_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_BenefitRedemptions_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_BenefitRedemptions_AmountOrPoints CHECK ((Amount IS NULL AND Points IS NOT NULL) OR (Amount IS NOT NULL AND Points IS NULL)),
        CONSTRAINT CK_BenefitRedemptions_CashedIn CHECK (TransactionId IS NULL OR Points IS NOT NULL)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shopping.BenefitRedemptions') AND name = 'IX_BenefitRedemptions_Benefit')
    CREATE INDEX IX_BenefitRedemptions_Benefit ON shopping.BenefitRedemptions(BenefitId, RedeemedOn) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shopping.BenefitRedemptions') AND name = 'UX_BenefitRedemptions_Transaction')
    CREATE UNIQUE INDEX UX_BenefitRedemptions_Transaction ON shopping.BenefitRedemptions(TransactionId)
        WHERE IsDeleted = 0 AND TransactionId IS NOT NULL;
GO

-- Points earned in one go (a purchase, a bonus), each batch with its own expiry. Only on a Points benefit (checked
-- by the service).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('shopping.PointBatches'))
BEGIN
    CREATE TABLE shopping.PointBatches
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PointBatches PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_PointBatches_Users REFERENCES shared.Users(Id),
        BenefitId       INT               NOT NULL CONSTRAINT FK_PointBatches_Benefits REFERENCES shopping.Benefits(Id),
        EarnedOn        DATE              NOT NULL,
        Points          INT               NOT NULL CONSTRAINT CK_PointBatches_Points CHECK (Points > 0),
        ExpiresOn       DATE              NULL,
        PurchaseId      INT               NULL     CONSTRAINT FK_PointBatches_Purchases REFERENCES shopping.Purchases(Id),
        Notes           NVARCHAR(500)     NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_PointBatches_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_PointBatches_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_PointBatches_Expiry CHECK (ExpiresOn IS NULL OR ExpiresOn >= EarnedOn)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shopping.PointBatches') AND name = 'IX_PointBatches_Benefit')
    CREATE INDEX IX_PointBatches_Benefit ON shopping.PointBatches(BenefitId, EarnedOn) WHERE IsDeleted = 0;
GO
