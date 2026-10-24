USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- LifeOS — AI assistant (Session 94). Schema `assistant`.
-- Each user brings their own Mistral API key, set in Settings. The key is stored encrypted at rest (a ...Secret
-- column, so SensitiveColumns encrypts it with Data Protection — CK_AssistantSettings_SecretsEncrypted refuses plain
-- text), is never sent back to the browser (only its last four characters and when it was set), and is neither
-- exported nor imported. Conversations are not stored: the browser keeps the chat for the session.

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'assistant')
    EXEC('CREATE SCHEMA assistant');
GO

-- One row per user (filtered unique below, so EF maps it one-to-one: updated in place, never re-inserted).
-- The key, its last four and when it was set are all there or all absent. Model is one of the Mistral chat models
-- the assistant offers (AssistantRules.Models).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('assistant.AssistantSettings'))
BEGIN
    CREATE TABLE assistant.AssistantSettings
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AssistantSettings PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_AssistantSettings_Users REFERENCES shared.Users(Id),
        IsEnabled       BIT               NOT NULL CONSTRAINT DF_AssistantSettings_IsEnabled DEFAULT (0),
        Model           NVARCHAR(40)      NOT NULL CONSTRAINT DF_AssistantSettings_Model DEFAULT (N'ministral-8b-2512')
                                                   CONSTRAINT CK_AssistantSettings_Model CHECK (Model IN (N'ministral-3b-2512', N'ministral-8b-2512', N'codestral-2508')),
        ApiKeySecret    NVARCHAR(2000)    NULL     CONSTRAINT CK_AssistantSettings_SecretsEncrypted CHECK (ApiKeySecret IS NULL OR ApiKeySecret LIKE 'CfDJ8%'),
        ApiKeyLast4     NVARCHAR(4)       NULL,
        ApiKeySetAt     DATETIME2         NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_AssistantSettings_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_AssistantSettings_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_AssistantSettings_Key CHECK (
            (ApiKeySecret IS NULL AND ApiKeyLast4 IS NULL AND ApiKeySetAt IS NULL)
            OR (ApiKeySecret IS NOT NULL AND ApiKeyLast4 IS NOT NULL AND ApiKeySetAt IS NOT NULL)),
        -- Switched on only with a key.
        CONSTRAINT CK_AssistantSettings_EnabledNeedsKey CHECK (IsEnabled = 0 OR ApiKeySecret IS NOT NULL)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('assistant.AssistantSettings') AND name = 'UX_AssistantSettings_User')
    CREATE UNIQUE INDEX UX_AssistantSettings_User ON assistant.AssistantSettings(UserId) WHERE IsDeleted = 0;
GO

-- Models changed after Session 94 at your request (2026-10-23): the free tier's rate limit on mistral-small-latest was
-- hit on the first question, so the assistant offers the higher-limit ministral-3b-2512, ministral-8b-2512 (default)
-- and codestral-2508. Rows on an old model move to the default; the CHECK and default are replaced when they lack
-- the new names, so the script stays re-runnable.
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_AssistantSettings_Model' AND definition NOT LIKE '%ministral-8b-2512%')
BEGIN
    ALTER TABLE assistant.AssistantSettings DROP CONSTRAINT CK_AssistantSettings_Model;
    UPDATE assistant.AssistantSettings
       SET Model = N'ministral-8b-2512', UpdatedAt = SYSUTCDATETIME()
     WHERE Model NOT IN (N'ministral-3b-2512', N'ministral-8b-2512', N'codestral-2508');
    ALTER TABLE assistant.AssistantSettings ADD CONSTRAINT CK_AssistantSettings_Model
        CHECK (Model IN (N'ministral-3b-2512', N'ministral-8b-2512', N'codestral-2508'));
END
GO

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_AssistantSettings_Model' AND definition NOT LIKE '%ministral-8b-2512%')
BEGIN
    ALTER TABLE assistant.AssistantSettings DROP CONSTRAINT DF_AssistantSettings_Model;
    ALTER TABLE assistant.AssistantSettings ADD CONSTRAINT DF_AssistantSettings_Model DEFAULT (N'ministral-8b-2512') FOR Model;
END
GO

-- What the assistant wrote (Session 95): one row per confirmed create/update — the assistant has no delete. EntityType
-- / EntityId use the EntityLinks type strings (Goal, Task, Habit, JournalEntry, Event, Reminder, Skill, Course,
-- MediaItem, Transaction, Contact, Asset; a milestone is logged against its Goal), so export → import remaps them and
-- Settings › AI assistant links to the item. Summary is the confirmation card's title ("Create goal: Run a half
-- marathon"). Exported and imported like any other user table.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('assistant.ActionLog'))
BEGIN
    CREATE TABLE assistant.ActionLog
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ActionLog PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_ActionLog_Users REFERENCES shared.Users(Id),
        Action          NVARCHAR(40)      NOT NULL,
        Kind            NVARCHAR(10)      NOT NULL CONSTRAINT CK_ActionLog_Kind CHECK (Kind IN (N'Created', N'Updated')),
        EntityType      NVARCHAR(50)      NOT NULL,
        EntityId        INT               NOT NULL,
        Summary         NVARCHAR(400)     NOT NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_ActionLog_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_ActionLog_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('assistant.ActionLog') AND name = 'IX_ActionLog_User_CreatedAt')
    CREATE INDEX IX_ActionLog_User_CreatedAt ON assistant.ActionLog(UserId, CreatedAt DESC) WHERE IsDeleted = 0;
GO
