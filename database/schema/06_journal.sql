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
