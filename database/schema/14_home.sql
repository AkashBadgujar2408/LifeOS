USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Home & Assets (Phase 3, Sessions 66-68). Depends on 01_shared.sql (Users, Tags, Contacts), 03_tasks.sql
-- (Projects — a household project is a tasks project with a budget), 04_calendar.sql (Reminders) and
-- 12_finance.sql (Transactions — a paid bill's expense, InsurancePolicies — a vehicle's cover).
-- What you live in (Properties), what you own (Assets, by room, categories are tags), what you drive (Vehicles),
-- what covers them (Warranties: warranty / extended warranty / AMC), what needs doing again and again
-- (MaintenanceTasks + their MaintenanceLogs), what the house costs to run (UtilityBills) and what's being done to
-- it (HouseholdProjects). "Next service", "expiring soon" and project spend are computed, never stored.
-- Selling, donating or throwing something away fills its disposal fields — it leaves the inventory but keeps its
-- history. Money is DECIMAL(19,4) + a 3-letter currency, as in Finance.

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'home')
    EXEC('CREATE SCHEMA home');
GO

-- A home (or land, an office...) you own, rent or stay in. MovedInOn/MovedOutOn: when it was yours to live in;
-- a property you've left keeps its history. PurchasePrice only when bought (an owned one).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('home.Properties'))
BEGIN
    CREATE TABLE home.Properties
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Properties PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Properties_Users REFERENCES shared.Users(Id),
        Name            NVARCHAR(200)     NOT NULL CONSTRAINT CK_Properties_Name CHECK (LEN(Name) > 0),
        Kind            NVARCHAR(20)      NOT NULL CONSTRAINT CK_Properties_Kind
                            CHECK (Kind IN ('House', 'Apartment', 'Land', 'Office', 'Other')),
        Ownership       NVARCHAR(10)      NOT NULL CONSTRAINT CK_Properties_Ownership CHECK (Ownership IN ('Owned', 'Rented', 'Family', 'Other')),
        Address         NVARCHAR(500)     NULL,
        MovedInOn       DATE              NULL,
        MovedOutOn      DATE              NULL,
        PurchasedOn     DATE              NULL,
        PurchasePrice   DECIMAL(19, 4)    NULL     CONSTRAINT CK_Properties_PurchasePrice CHECK (PurchasePrice > 0),
        Currency        CHAR(3)           NULL     CONSTRAINT CK_Properties_Currency
                            CHECK (Currency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        Notes           NVARCHAR(2000)    NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Properties_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Properties_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_Properties_MovedOut CHECK (MovedOutOn IS NULL OR MovedInOn IS NULL OR MovedOutOn >= MovedInOn),
        CONSTRAINT CK_Properties_PricePair CHECK (PurchasePrice IS NULL OR Currency IS NOT NULL),
        CONSTRAINT CK_Properties_Purchase CHECK ((PurchasedOn IS NULL AND PurchasePrice IS NULL) OR Ownership = 'Owned')
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('home.Properties') AND name = 'UX_Properties_User_Name')
    CREATE UNIQUE INDEX UX_Properties_User_Name ON home.Properties(UserId, Name) WHERE IsDeleted = 0;
GO

-- Something you own worth keeping track of: a fridge, a laptop, a sofa, jewellery. Room is free text ("Kitchen")
-- within a property — the inventory is grouped by it; categories are tags (AssetTags). Disposal: sold, donated,
-- thrown away or lost on DisposedOn — it leaves the inventory, keeps its history; DisposalAmount = what it sold for.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('home.Assets'))
BEGIN
    CREATE TABLE home.Assets
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Assets PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Assets_Users REFERENCES shared.Users(Id),
        Name            NVARCHAR(200)     NOT NULL CONSTRAINT CK_Assets_Name CHECK (LEN(Name) > 0),
        PropertyId      INT               NULL     CONSTRAINT FK_Assets_Properties REFERENCES home.Properties(Id),
        Room            NVARCHAR(100)     NULL     CONSTRAINT CK_Assets_Room CHECK (LEN(Room) > 0),
        Brand           NVARCHAR(100)     NULL,
        Model           NVARCHAR(100)     NULL,
        SerialNumber    NVARCHAR(100)     NULL,
        Quantity        INT               NOT NULL CONSTRAINT DF_Assets_Quantity DEFAULT (1)
                                                   CONSTRAINT CK_Assets_Quantity CHECK (Quantity BETWEEN 1 AND 10000),
        PurchasedOn     DATE              NULL,
        PurchasePrice   DECIMAL(19, 4)    NULL     CONSTRAINT CK_Assets_PurchasePrice CHECK (PurchasePrice >= 0),
        Currency        CHAR(3)           NULL     CONSTRAINT CK_Assets_Currency
                            CHECK (Currency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        DisposedOn      DATE              NULL,
        DisposalKind    NVARCHAR(10)      NULL     CONSTRAINT CK_Assets_DisposalKind CHECK (DisposalKind IN ('Sold', 'Donated', 'Discarded', 'Lost')),
        DisposalAmount  DECIMAL(19, 4)    NULL     CONSTRAINT CK_Assets_DisposalAmount CHECK (DisposalAmount >= 0),
        Notes           NVARCHAR(2000)    NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Assets_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Assets_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_Assets_MoneyCurrency CHECK ((PurchasePrice IS NULL AND DisposalAmount IS NULL) OR Currency IS NOT NULL),
        CONSTRAINT CK_Assets_DisposalPair CHECK ((DisposedOn IS NULL AND DisposalKind IS NULL) OR (DisposedOn IS NOT NULL AND DisposalKind IS NOT NULL)),
        CONSTRAINT CK_Assets_DisposalAmountSold CHECK (DisposalAmount IS NULL OR DisposalKind = 'Sold'),
        CONSTRAINT CK_Assets_Disposed CHECK (DisposedOn IS NULL OR PurchasedOn IS NULL OR DisposedOn >= PurchasedOn)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('home.Assets') AND name = 'IX_Assets_User_Property')
    CREATE INDEX IX_Assets_User_Property ON home.Assets(UserId, PropertyId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('home.AssetTags'))
BEGIN
    CREATE TABLE home.AssetTags
    (
        Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AssetTags PRIMARY KEY,
        UserId      INT               NOT NULL CONSTRAINT FK_AssetTags_Users REFERENCES shared.Users(Id),
        AssetId     INT               NOT NULL CONSTRAINT FK_AssetTags_Assets REFERENCES home.Assets(Id),
        TagId       INT               NOT NULL CONSTRAINT FK_AssetTags_Tags REFERENCES shared.Tags(Id),
        CreatedAt   DATETIME2         NOT NULL CONSTRAINT DF_AssetTags_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt   DATETIME2         NULL,
        IsDeleted   BIT               NOT NULL CONSTRAINT DF_AssetTags_IsDeleted DEFAULT (0),
        DeletedAt   DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('home.AssetTags') AND name = 'UX_AssetTags_Asset_Tag')
    CREATE UNIQUE INDEX UX_AssetTags_Asset_Tag ON home.AssetTags(AssetId, TagId) WHERE IsDeleted = 0;
GO

-- A car, a bike, a scooter. Insurance is a Finance policy (InsurancePolicyId — its renewal reminder is owned
-- there); the pollution certificate (PUC) and the registration have their own valid-until days, each with a
-- reminder owned by the vehicles service, ReminderDays before (same pattern as insurance renewals).
-- Disposal as for assets.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('home.Vehicles'))
BEGIN
    CREATE TABLE home.Vehicles
    (
        Id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Vehicles PRIMARY KEY,
        UserId                  INT               NOT NULL CONSTRAINT FK_Vehicles_Users REFERENCES shared.Users(Id),
        Name                    NVARCHAR(200)     NOT NULL CONSTRAINT CK_Vehicles_Name CHECK (LEN(Name) > 0),
        Kind                    NVARCHAR(20)      NOT NULL CONSTRAINT CK_Vehicles_Kind
                                    CHECK (Kind IN ('Car', 'Motorcycle', 'Scooter', 'Bicycle', 'Other')),
        Make                    NVARCHAR(100)     NULL,
        Model                   NVARCHAR(100)     NULL,
        ModelYear               SMALLINT          NULL     CONSTRAINT CK_Vehicles_ModelYear CHECK (ModelYear BETWEEN 1885 AND 2200),
        RegistrationNumber      NVARCHAR(20)      NULL     CONSTRAINT CK_Vehicles_RegistrationNumber CHECK (LEN(RegistrationNumber) > 0),
        PurchasedOn             DATE              NULL,
        PurchasePrice           DECIMAL(19, 4)    NULL     CONSTRAINT CK_Vehicles_PurchasePrice CHECK (PurchasePrice >= 0),
        Currency                CHAR(3)           NULL     CONSTRAINT CK_Vehicles_Currency
                                    CHECK (Currency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        InsurancePolicyId       INT               NULL     CONSTRAINT FK_Vehicles_InsurancePolicies REFERENCES finance.InsurancePolicies(Id),
        PucValidUntil           DATE              NULL,
        PucReminderId           INT               NULL     CONSTRAINT FK_Vehicles_PucReminder REFERENCES calendar.Reminders(Id),
        RegistrationValidUntil  DATE              NULL,
        RegistrationReminderId  INT               NULL     CONSTRAINT FK_Vehicles_RegistrationReminder REFERENCES calendar.Reminders(Id),
        ReminderDays            INT               NULL     CONSTRAINT CK_Vehicles_ReminderDays CHECK (ReminderDays BETWEEN 0 AND 365),
        DisposedOn              DATE              NULL,
        DisposalKind            NVARCHAR(10)      NULL     CONSTRAINT CK_Vehicles_DisposalKind CHECK (DisposalKind IN ('Sold', 'Donated', 'Discarded', 'Lost')),
        DisposalAmount          DECIMAL(19, 4)    NULL     CONSTRAINT CK_Vehicles_DisposalAmount CHECK (DisposalAmount >= 0),
        Notes                   NVARCHAR(2000)    NULL,
        CreatedAt               DATETIME2         NOT NULL CONSTRAINT DF_Vehicles_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt               DATETIME2         NULL,
        IsDeleted               BIT               NOT NULL CONSTRAINT DF_Vehicles_IsDeleted DEFAULT (0),
        DeletedAt               DATETIME2         NULL,
        CONSTRAINT CK_Vehicles_MoneyCurrency CHECK ((PurchasePrice IS NULL AND DisposalAmount IS NULL) OR Currency IS NOT NULL),
        CONSTRAINT CK_Vehicles_PucReminder CHECK (PucReminderId IS NULL OR PucValidUntil IS NOT NULL),
        CONSTRAINT CK_Vehicles_RegistrationReminder CHECK (RegistrationReminderId IS NULL OR RegistrationValidUntil IS NOT NULL),
        CONSTRAINT CK_Vehicles_DisposalPair CHECK ((DisposedOn IS NULL AND DisposalKind IS NULL) OR (DisposedOn IS NOT NULL AND DisposalKind IS NOT NULL)),
        CONSTRAINT CK_Vehicles_DisposalAmountSold CHECK (DisposalAmount IS NULL OR DisposalKind = 'Sold'),
        CONSTRAINT CK_Vehicles_Disposed CHECK (DisposedOn IS NULL OR PurchasedOn IS NULL OR DisposedOn >= PurchasedOn)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('home.Vehicles') AND name = 'UX_Vehicles_User_Name')
    CREATE UNIQUE INDEX UX_Vehicles_User_Name ON home.Vehicles(UserId, Name) WHERE IsDeleted = 0;
GO

-- What covers an item: the maker's warranty, an extended warranty, an annual maintenance contract (AMC). Exactly
-- one of the asset / vehicle / property it covers. ExpiresOn always known (that's the point); its reminder is
-- owned by the warranties service, ReminderDays before. ContactId: the service centre to call.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('home.Warranties'))
BEGIN
    CREATE TABLE home.Warranties
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Warranties PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Warranties_Users REFERENCES shared.Users(Id),
        Kind            NVARCHAR(10)      NOT NULL CONSTRAINT CK_Warranties_Kind CHECK (Kind IN ('Warranty', 'Extended', 'AMC')),
        AssetId         INT               NULL     CONSTRAINT FK_Warranties_Assets REFERENCES home.Assets(Id),
        VehicleId       INT               NULL     CONSTRAINT FK_Warranties_Vehicles REFERENCES home.Vehicles(Id),
        PropertyId      INT               NULL     CONSTRAINT FK_Warranties_Properties REFERENCES home.Properties(Id),
        Provider        NVARCHAR(200)     NULL,
        StartsOn        DATE              NULL,
        ExpiresOn       DATE              NOT NULL,
        Cost            DECIMAL(19, 4)    NULL     CONSTRAINT CK_Warranties_Cost CHECK (Cost >= 0),
        Currency        CHAR(3)           NULL     CONSTRAINT CK_Warranties_Currency
                            CHECK (Currency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        ContactId       INT               NULL     CONSTRAINT FK_Warranties_Contacts REFERENCES shared.Contacts(Id),
        ReminderDays    INT               NULL     CONSTRAINT CK_Warranties_ReminderDays CHECK (ReminderDays BETWEEN 0 AND 365),
        ReminderId      INT               NULL     CONSTRAINT FK_Warranties_Reminders REFERENCES calendar.Reminders(Id),
        Notes           NVARCHAR(2000)    NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Warranties_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Warranties_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_Warranties_Covers CHECK (
            (CASE WHEN AssetId IS NULL THEN 0 ELSE 1 END)
          + (CASE WHEN VehicleId IS NULL THEN 0 ELSE 1 END)
          + (CASE WHEN PropertyId IS NULL THEN 0 ELSE 1 END) = 1),
        CONSTRAINT CK_Warranties_Dates CHECK (StartsOn IS NULL OR ExpiresOn >= StartsOn),
        CONSTRAINT CK_Warranties_CostPair CHECK (Cost IS NULL OR Currency IS NOT NULL)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('home.Warranties') AND name = 'IX_Warranties_User_ExpiresOn')
    CREATE INDEX IX_Warranties_User_ExpiresOn ON home.Warranties(UserId, ExpiresOn) WHERE IsDeleted = 0;
GO

-- Something that needs doing again and again: service the car every 6 months, clean the water tank every 3,
-- the AC before summer. "Every RecurrenceInterval RecurrenceFrequency" (same words as tasks), on one asset /
-- vehicle / property or none. The next due day is computed: FirstDueOn until it's first done, then the last
-- MaintenanceLogs.DoneOn moved on by the interval — never stored. A paused one isn't due. Its reminder (next
-- due day, ReminderDays before) is owned by the maintenance service and moves when it's done.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('home.MaintenanceTasks'))
BEGIN
    CREATE TABLE home.MaintenanceTasks
    (
        Id                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MaintenanceTasks PRIMARY KEY,
        UserId              INT               NOT NULL CONSTRAINT FK_MaintenanceTasks_Users REFERENCES shared.Users(Id),
        Title               NVARCHAR(200)     NOT NULL CONSTRAINT CK_MaintenanceTasks_Title CHECK (LEN(Title) > 0),
        AssetId             INT               NULL     CONSTRAINT FK_MaintenanceTasks_Assets REFERENCES home.Assets(Id),
        VehicleId           INT               NULL     CONSTRAINT FK_MaintenanceTasks_Vehicles REFERENCES home.Vehicles(Id),
        PropertyId          INT               NULL     CONSTRAINT FK_MaintenanceTasks_Properties REFERENCES home.Properties(Id),
        RecurrenceFrequency NVARCHAR(10)      NOT NULL CONSTRAINT CK_MaintenanceTasks_RecurrenceFrequency
                                CHECK (RecurrenceFrequency IN ('Daily', 'Weekly', 'Monthly', 'Yearly')),
        RecurrenceInterval  INT               NOT NULL CONSTRAINT CK_MaintenanceTasks_RecurrenceInterval CHECK (RecurrenceInterval BETWEEN 1 AND 999),
        FirstDueOn          DATE              NOT NULL,
        IsPaused            BIT               NOT NULL CONSTRAINT DF_MaintenanceTasks_IsPaused DEFAULT (0),
        ContactId           INT               NULL     CONSTRAINT FK_MaintenanceTasks_Contacts REFERENCES shared.Contacts(Id),
        ReminderDays        INT               NULL     CONSTRAINT CK_MaintenanceTasks_ReminderDays CHECK (ReminderDays BETWEEN 0 AND 365),
        ReminderId          INT               NULL     CONSTRAINT FK_MaintenanceTasks_Reminders REFERENCES calendar.Reminders(Id),
        Notes               NVARCHAR(2000)    NULL,
        CreatedAt           DATETIME2         NOT NULL CONSTRAINT DF_MaintenanceTasks_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt           DATETIME2         NULL,
        IsDeleted           BIT               NOT NULL CONSTRAINT DF_MaintenanceTasks_IsDeleted DEFAULT (0),
        DeletedAt           DATETIME2         NULL,
        CONSTRAINT CK_MaintenanceTasks_Target CHECK (
            (CASE WHEN AssetId IS NULL THEN 0 ELSE 1 END)
          + (CASE WHEN VehicleId IS NULL THEN 0 ELSE 1 END)
          + (CASE WHEN PropertyId IS NULL THEN 0 ELSE 1 END) <= 1)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('home.MaintenanceTasks') AND name = 'IX_MaintenanceTasks_User')
    CREATE INDEX IX_MaintenanceTasks_User ON home.MaintenanceTasks(UserId) WHERE IsDeleted = 0;
GO

-- Each time a maintenance task was done: the day, what it cost, the odometer for a vehicle, the expense in
-- Finance if it was recorded there. The latest DoneOn decides the next due day.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('home.MaintenanceLogs'))
BEGIN
    CREATE TABLE home.MaintenanceLogs
    (
        Id                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MaintenanceLogs PRIMARY KEY,
        UserId              INT               NOT NULL CONSTRAINT FK_MaintenanceLogs_Users REFERENCES shared.Users(Id),
        MaintenanceTaskId   INT               NOT NULL CONSTRAINT FK_MaintenanceLogs_MaintenanceTasks REFERENCES home.MaintenanceTasks(Id),
        DoneOn              DATE              NOT NULL,
        Cost                DECIMAL(19, 4)    NULL     CONSTRAINT CK_MaintenanceLogs_Cost CHECK (Cost >= 0),
        Currency            CHAR(3)           NULL     CONSTRAINT CK_MaintenanceLogs_Currency
                                CHECK (Currency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        OdometerKm          INT               NULL     CONSTRAINT CK_MaintenanceLogs_OdometerKm CHECK (OdometerKm BETWEEN 0 AND 10000000),
        TransactionId       INT               NULL     CONSTRAINT FK_MaintenanceLogs_Transactions REFERENCES finance.Transactions(Id),
        Notes               NVARCHAR(2000)    NULL,
        CreatedAt           DATETIME2         NOT NULL CONSTRAINT DF_MaintenanceLogs_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt           DATETIME2         NULL,
        IsDeleted           BIT               NOT NULL CONSTRAINT DF_MaintenanceLogs_IsDeleted DEFAULT (0),
        DeletedAt           DATETIME2         NULL,
        CONSTRAINT CK_MaintenanceLogs_CostPair CHECK (Cost IS NULL OR Currency IS NOT NULL)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('home.MaintenanceLogs') AND name = 'IX_MaintenanceLogs_Task_DoneOn')
    CREATE INDEX IX_MaintenanceLogs_Task_DoneOn ON home.MaintenanceLogs(MaintenanceTaskId, DoneOn) WHERE IsDeleted = 0;
GO

-- A bill for running the house: electricity, water, gas, internet, the society's maintenance, rent. DueOn goes on
-- the calendar (Session 68). Paying it records PaidOn and, through the bills service, one Finance expense
-- (TransactionId — unique, so a bill is never paid into the ledger twice). UnitsUsed: kWh, litres, GB...
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('home.UtilityBills'))
BEGIN
    CREATE TABLE home.UtilityBills
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_UtilityBills PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_UtilityBills_Users REFERENCES shared.Users(Id),
        PropertyId      INT               NULL     CONSTRAINT FK_UtilityBills_Properties REFERENCES home.Properties(Id),
        Kind            NVARCHAR(20)      NOT NULL CONSTRAINT CK_UtilityBills_Kind
                            CHECK (Kind IN ('Electricity', 'Water', 'Gas', 'Internet', 'Phone', 'Maintenance', 'Rent', 'Other')),
        Provider        NVARCHAR(200)     NULL,
        PeriodStart     DATE              NULL,
        PeriodEnd       DATE              NULL,
        DueOn           DATE              NOT NULL,
        Amount          DECIMAL(19, 4)    NOT NULL CONSTRAINT CK_UtilityBills_Amount CHECK (Amount > 0),
        Currency        CHAR(3)           NOT NULL CONSTRAINT CK_UtilityBills_Currency
                            CHECK (Currency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        UnitsUsed       DECIMAL(19, 4)    NULL     CONSTRAINT CK_UtilityBills_UnitsUsed CHECK (UnitsUsed >= 0),
        PaidOn          DATE              NULL,
        TransactionId   INT               NULL     CONSTRAINT FK_UtilityBills_Transactions REFERENCES finance.Transactions(Id),
        Notes           NVARCHAR(2000)    NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_UtilityBills_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_UtilityBills_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_UtilityBills_Period CHECK (PeriodStart IS NULL OR PeriodEnd IS NULL OR PeriodEnd >= PeriodStart),
        CONSTRAINT CK_UtilityBills_Transaction CHECK (TransactionId IS NULL OR PaidOn IS NOT NULL)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('home.UtilityBills') AND name = 'IX_UtilityBills_User_DueOn')
    CREATE INDEX IX_UtilityBills_User_DueOn ON home.UtilityBills(UserId, DueOn) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('home.UtilityBills') AND name = 'UX_UtilityBills_Transaction')
    CREATE UNIQUE INDEX UX_UtilityBills_Transaction ON home.UtilityBills(TransactionId) WHERE IsDeleted = 0 AND TransactionId IS NOT NULL;
GO

-- A household project (repaint the flat, fit a new kitchen) is a tasks project — its name, status and tasks live
-- there — plus what only a home project has: the property and a budget. One per project. What's been spent is
-- the Finance transactions linked to it (EntityLinks, like savings goals), computed.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('home.HouseholdProjects'))
BEGIN
    CREATE TABLE home.HouseholdProjects
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_HouseholdProjects PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_HouseholdProjects_Users REFERENCES shared.Users(Id),
        ProjectId       INT               NOT NULL CONSTRAINT FK_HouseholdProjects_Projects REFERENCES tasks.Projects(Id),
        PropertyId      INT               NULL     CONSTRAINT FK_HouseholdProjects_Properties REFERENCES home.Properties(Id),
        Budget          DECIMAL(19, 4)    NULL     CONSTRAINT CK_HouseholdProjects_Budget CHECK (Budget > 0),
        Currency        CHAR(3)           NULL     CONSTRAINT CK_HouseholdProjects_Currency
                            CHECK (Currency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_HouseholdProjects_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_HouseholdProjects_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_HouseholdProjects_BudgetPair CHECK ((Budget IS NULL AND Currency IS NULL) OR (Budget IS NOT NULL AND Currency IS NOT NULL))
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('home.HouseholdProjects') AND name = 'UX_HouseholdProjects_Project')
    CREATE UNIQUE INDEX UX_HouseholdProjects_Project ON home.HouseholdProjects(ProjectId) WHERE IsDeleted = 0;
GO

-- Session 68a: fuel & mileage. A vehicle's fuel is measured in one unit (litres; kg for CNG; kWh for an EV).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('home.Vehicles') AND name = 'FuelUnit')
    ALTER TABLE home.Vehicles ADD
        FuelUnit NVARCHAR(5) NOT NULL CONSTRAINT DF_Vehicles_FuelUnit DEFAULT ('Litre')
                                      CONSTRAINT CK_Vehicles_FuelUnit CHECK (FuelUnit IN ('Litre', 'Kg', 'kWh'));
GO

-- One refuel: the day, the odometer, what was paid, and EITHER the price per unit OR the quantity (the other is
-- computed). Most fills are partial, made when the tank is near empty, so mileage is one overall average over all
-- fills (FuelEconomy, computed, never stored). MissedFillBefore: a fill before this one wasn't logged, so the
-- average starts again here. TransactionId: the Finance expense it was paid with — unique, recorded once.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('home.FuelLogs'))
BEGIN
    CREATE TABLE home.FuelLogs
    (
        Id                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_FuelLogs PRIMARY KEY,
        UserId              INT               NOT NULL CONSTRAINT FK_FuelLogs_Users REFERENCES shared.Users(Id),
        VehicleId           INT               NOT NULL CONSTRAINT FK_FuelLogs_Vehicles REFERENCES home.Vehicles(Id),
        FilledOn            DATE              NOT NULL,
        OdometerKm          INT               NOT NULL CONSTRAINT CK_FuelLogs_OdometerKm CHECK (OdometerKm BETWEEN 0 AND 10000000),
        Amount              DECIMAL(19, 4)    NOT NULL CONSTRAINT CK_FuelLogs_Amount CHECK (Amount > 0),
        Currency            CHAR(3)           NOT NULL CONSTRAINT CK_FuelLogs_Currency
                                CHECK (Currency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]'),
        PricePerUnit        DECIMAL(19, 4)    NULL     CONSTRAINT CK_FuelLogs_PricePerUnit CHECK (PricePerUnit > 0),
        Quantity            DECIMAL(19, 4)    NULL     CONSTRAINT CK_FuelLogs_Quantity CHECK (Quantity > 0),
        MissedFillBefore    BIT               NOT NULL CONSTRAINT DF_FuelLogs_MissedFillBefore DEFAULT (0),
        TransactionId       INT               NULL     CONSTRAINT FK_FuelLogs_Transactions REFERENCES finance.Transactions(Id),
        Notes               NVARCHAR(500)     NULL,
        CreatedAt           DATETIME2         NOT NULL CONSTRAINT DF_FuelLogs_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt           DATETIME2         NULL,
        IsDeleted           BIT               NOT NULL CONSTRAINT DF_FuelLogs_IsDeleted DEFAULT (0),
        DeletedAt           DATETIME2         NULL,
        CONSTRAINT CK_FuelLogs_PriceOrQuantity CHECK ((PricePerUnit IS NULL AND Quantity IS NOT NULL) OR (PricePerUnit IS NOT NULL AND Quantity IS NULL))
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('home.FuelLogs') AND name = 'IX_FuelLogs_Vehicle_FilledOn')
    CREATE INDEX IX_FuelLogs_Vehicle_FilledOn ON home.FuelLogs(VehicleId, FilledOn, OdometerKm) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('home.FuelLogs') AND name = 'UX_FuelLogs_Transaction')
    CREATE UNIQUE INDEX UX_FuelLogs_Transaction ON home.FuelLogs(TransactionId) WHERE IsDeleted = 0 AND TransactionId IS NOT NULL;
GO
