USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Journal & Reflections (Month 1, Milestone 6). Depends on 01_shared.sql (Users, LifeAreas).
-- One entry per day (written about that day, in the user's own calendar terms), with an optional mood; plus one short
-- weekly reflection per week. Text only in Month 1 — attachments are a Phase 2 item (plan doc, gaps table).

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'journal')
    EXEC('CREATE SCHEMA journal');
GO

-- EntryDate is the day the entry is about (DATE, the user's local day — same as task due dates and habit entries).
-- Mood is a 1-5 scale (1 = awful ... 5 = great); the labels live in the app, the number is what the trend view plots.
-- An entry can be just a mood or just words, but not nothing: CK_JournalEntries_NotEmpty. (Whitespace-only content
-- is the service's job to reject — a CHECK can't trim NVARCHAR(MAX) cheaply.)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('journal.JournalEntries'))
BEGIN
    CREATE TABLE journal.JournalEntries
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_JournalEntries PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_JournalEntries_Users REFERENCES shared.Users(Id),
        LifeAreaId      INT               NULL     CONSTRAINT FK_JournalEntries_LifeAreas REFERENCES shared.LifeAreas(Id),
        EntryDate       DATE              NOT NULL,
        Title           NVARCHAR(200)     NULL,
        Content         NVARCHAR(MAX)     NULL,
        Mood            TINYINT           NULL     CONSTRAINT CK_JournalEntries_Mood CHECK (Mood BETWEEN 1 AND 5),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_JournalEntries_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_JournalEntries_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_JournalEntries_NotEmpty CHECK (Content IS NOT NULL OR Mood IS NOT NULL)
    );
END
GO

-- One live entry per user per day: the daily editor opens "today's entry" rather than piling up new ones. Filtered,
-- so a deleted entry's day can be written again.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('journal.JournalEntries') AND name = 'UX_JournalEntries_User_Date')
    CREATE UNIQUE INDEX UX_JournalEntries_User_Date ON journal.JournalEntries(UserId, EntryDate) INCLUDE (Mood) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('journal.JournalEntries') AND name = 'IX_JournalEntries_LifeAreaId')
    CREATE INDEX IX_JournalEntries_LifeAreaId ON journal.JournalEntries(LifeAreaId) WHERE IsDeleted = 0;
GO

-- The weekly look back: three short prompts, answered once per week. WeekStartDate is that week's Monday (ISO weeks,
-- matching the en-gb calendar). 1900-01-01 was a Monday, so "is a Monday" is a DATEDIFF modulo 7 — independent of the
-- session's DATEFIRST setting, unlike DATEPART(weekday, ...).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('journal.WeeklyReflections'))
BEGIN
    CREATE TABLE journal.WeeklyReflections
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_WeeklyReflections PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_WeeklyReflections_Users REFERENCES shared.Users(Id),
        WeekStartDate   DATE              NOT NULL CONSTRAINT CK_WeeklyReflections_Monday
                                                   CHECK (DATEDIFF(DAY, CONVERT(DATE, '19000101', 112), WeekStartDate) % 7 = 0),
        WentWell        NVARCHAR(MAX)     NULL,
        WasHard         NVARCHAR(MAX)     NULL,
        NextFocus       NVARCHAR(MAX)     NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_WeeklyReflections_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_WeeklyReflections_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_WeeklyReflections_NotEmpty CHECK (WentWell IS NOT NULL OR WasHard IS NOT NULL OR NextFocus IS NOT NULL)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('journal.WeeklyReflections') AND name = 'UX_WeeklyReflections_User_Week')
    CREATE UNIQUE INDEX UX_WeeklyReflections_User_Week ON journal.WeeklyReflections(UserId, WeekStartDate) WHERE IsDeleted = 0;
GO

-- Session 42 (journal follow-up). Also depends on 01_shared.sql (Tags) and 04_calendar.sql (Reminders, for decision
-- review reminders).

-- Tags on journal entries: the per-module join pattern (goals.GoalTags), filtered unique so untag-then-retag works.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('journal.JournalEntryTags'))
BEGIN
    CREATE TABLE journal.JournalEntryTags
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_JournalEntryTags PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_JournalEntryTags_Users REFERENCES shared.Users(Id),
        JournalEntryId  INT               NOT NULL CONSTRAINT FK_JournalEntryTags_JournalEntries REFERENCES journal.JournalEntries(Id),
        TagId           INT               NOT NULL CONSTRAINT FK_JournalEntryTags_Tags REFERENCES shared.Tags(Id),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_JournalEntryTags_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_JournalEntryTags_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('journal.JournalEntryTags') AND name = 'UX_JournalEntryTags_Entry_Tag')
    CREATE UNIQUE INDEX UX_JournalEntryTags_Entry_Tag ON journal.JournalEntryTags(JournalEntryId, TagId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('journal.JournalEntryTags') AND name = 'IX_JournalEntryTags_Tag')
    CREATE INDEX IX_JournalEntryTags_Tag ON journal.JournalEntryTags(TagId) WHERE IsDeleted = 0;
GO

-- Short lists kept with a day: things to be grateful for, lessons life taught. Keyed by the day (like the entry), not
-- by the entry, so a day can have them without a written entry. Saving a day's notes replaces its lists (old rows
-- soft-deleted); SortOrder keeps them in the order written.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('journal.JournalNotes'))
BEGIN
    CREATE TABLE journal.JournalNotes
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_JournalNotes PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_JournalNotes_Users REFERENCES shared.Users(Id),
        EntryDate       DATE              NOT NULL,
        Kind            NVARCHAR(20)      NOT NULL CONSTRAINT CK_JournalNotes_Kind CHECK (Kind IN ('Gratitude', 'Lesson')),
        Text            NVARCHAR(500)     NOT NULL CONSTRAINT CK_JournalNotes_Text CHECK (LEN(Text) > 0),
        SortOrder       INT               NOT NULL CONSTRAINT DF_JournalNotes_SortOrder DEFAULT (0),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_JournalNotes_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_JournalNotes_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('journal.JournalNotes') AND name = 'IX_JournalNotes_User_Date')
    CREATE INDEX IX_JournalNotes_User_Date ON journal.JournalNotes(UserId, EntryDate) INCLUDE (Kind) WHERE IsDeleted = 0;
GO

-- The decision journal: a decision, why, what is expected, then on the review day what actually happened. ReviewOn
-- gets an ordinary reminder ("Review your decision: ...", 09:00 local) kept in step by the journal service, like a
-- document's expiry reminder (ReviewReminderId). The outcome is recorded once: ActualOutcome and ReviewedOn together,
-- Verdict (how it turned out against what was expected) only with them.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('journal.Decisions'))
BEGIN
    CREATE TABLE journal.Decisions
    (
        Id                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Decisions PRIMARY KEY,
        UserId              INT               NOT NULL CONSTRAINT FK_Decisions_Users REFERENCES shared.Users(Id),
        DecidedOn           DATE              NOT NULL,
        Title               NVARCHAR(300)     NOT NULL CONSTRAINT CK_Decisions_Title CHECK (LEN(Title) > 0),
        Reasons             NVARCHAR(MAX)     NULL,
        ExpectedOutcome     NVARCHAR(MAX)     NULL,
        ReviewOn            DATE              NULL,
        ReviewReminderId    INT               NULL CONSTRAINT FK_Decisions_ReviewReminder REFERENCES calendar.Reminders(Id),
        ActualOutcome       NVARCHAR(MAX)     NULL,
        Verdict             NVARCHAR(20)      NULL CONSTRAINT CK_Decisions_Verdict
                                CHECK (Verdict IS NULL OR Verdict IN ('Better', 'AsExpected', 'Worse')),
        ReviewedOn          DATE              NULL,
        CreatedAt           DATETIME2         NOT NULL CONSTRAINT DF_Decisions_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt           DATETIME2         NULL,
        IsDeleted           BIT               NOT NULL CONSTRAINT DF_Decisions_IsDeleted DEFAULT (0),
        DeletedAt           DATETIME2         NULL,
        CONSTRAINT CK_Decisions_ReviewOn CHECK (ReviewOn IS NULL OR ReviewOn >= DecidedOn),
        CONSTRAINT CK_Decisions_Outcome CHECK (
            (ActualOutcome IS NULL AND ReviewedOn IS NULL AND Verdict IS NULL)
            OR (ActualOutcome IS NOT NULL AND ReviewedOn IS NOT NULL AND ReviewedOn >= DecidedOn))
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('journal.Decisions') AND name = 'IX_Decisions_User_DecidedOn')
    CREATE INDEX IX_Decisions_User_DecidedOn ON journal.Decisions(UserId, DecidedOn) WHERE IsDeleted = 0;
GO

-- Due for review: not reviewed yet, review day reached.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('journal.Decisions') AND name = 'IX_Decisions_User_ReviewOn')
    CREATE INDEX IX_Decisions_User_ReviewOn ON journal.Decisions(UserId, ReviewOn) WHERE IsDeleted = 0 AND ReviewedOn IS NULL;
GO

-- The monthly look back, one per month keyed by its first day (like the weekly one by its Monday).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('journal.MonthlyReflections'))
BEGIN
    CREATE TABLE journal.MonthlyReflections
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_MonthlyReflections PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_MonthlyReflections_Users REFERENCES shared.Users(Id),
        MonthStart      DATE              NOT NULL CONSTRAINT CK_MonthlyReflections_MonthStart CHECK (DAY(MonthStart) = 1),
        Highlights      NVARCHAR(MAX)     NULL,
        Learned         NVARCHAR(MAX)     NULL,
        WouldChange     NVARCHAR(MAX)     NULL,
        NextFocus       NVARCHAR(MAX)     NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_MonthlyReflections_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_MonthlyReflections_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_MonthlyReflections_NotEmpty
            CHECK (Highlights IS NOT NULL OR Learned IS NOT NULL OR WouldChange IS NOT NULL OR NextFocus IS NOT NULL)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('journal.MonthlyReflections') AND name = 'UX_MonthlyReflections_User_Month')
    CREATE UNIQUE INDEX UX_MonthlyReflections_User_Month ON journal.MonthlyReflections(UserId, MonthStart) WHERE IsDeleted = 0;
GO
