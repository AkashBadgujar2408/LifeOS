USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'shared')
    EXEC('CREATE SCHEMA shared');
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('shared.Users'))
BEGIN
    CREATE TABLE shared.Users
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
        Username        NVARCHAR(100)     NOT NULL,
        Email           NVARCHAR(256)     NOT NULL,
        PasswordHash    NVARCHAR(500)     NOT NULL,
        DisplayName     NVARCHAR(200)     NOT NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Users_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

-- Upgrade path for Users tables created before Username existed (login now uses Username, not Email).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('shared.Users') AND name = 'Username')
    ALTER TABLE shared.Users ADD Username NVARCHAR(100) NULL;
GO

UPDATE shared.Users SET Username = LEFT(Email, CHARINDEX('@', Email) - 1) WHERE Username IS NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('shared.Users') AND name = 'Username' AND is_nullable = 1)
    ALTER TABLE shared.Users ALTER COLUMN Username NVARCHAR(100) NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shared.Users') AND name = 'UX_Users_Email')
    CREATE UNIQUE INDEX UX_Users_Email ON shared.Users(Email) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shared.Users') AND name = 'UX_Users_Username')
    CREATE UNIQUE INDEX UX_Users_Username ON shared.Users(Username) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('shared.LifeAreas'))
BEGIN
    CREATE TABLE shared.LifeAreas
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_LifeAreas PRIMARY KEY,
        Name            NVARCHAR(100)     NOT NULL,
        SortOrder       INT               NOT NULL CONSTRAINT DF_LifeAreas_SortOrder DEFAULT (0),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_LifeAreas_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_LifeAreas_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shared.LifeAreas') AND name = 'UX_LifeAreas_Name')
    CREATE UNIQUE INDEX UX_LifeAreas_Name ON shared.LifeAreas(Name) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM shared.LifeAreas)
BEGIN
    INSERT INTO shared.LifeAreas (Name, SortOrder) VALUES
        ('Career', 1),
        ('Learning', 2),
        ('Health', 3),
        ('Finance', 4),
        ('Relationships', 5),
        ('Personal / Fun', 6);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('shared.Tags'))
BEGIN
    CREATE TABLE shared.Tags
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Tags PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Tags_Users REFERENCES shared.Users(Id),
        Name            NVARCHAR(100)     NOT NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Tags_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Tags_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shared.Tags') AND name = 'UX_Tags_UserId_Name')
    CREATE UNIQUE INDEX UX_Tags_UserId_Name ON shared.Tags(UserId, Name) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('shared.EntityLinks'))
BEGIN
    CREATE TABLE shared.EntityLinks
    (
        Id                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_EntityLinks PRIMARY KEY,
        UserId              INT               NOT NULL CONSTRAINT FK_EntityLinks_Users REFERENCES shared.Users(Id),
        SourceEntityType    NVARCHAR(100)     NOT NULL,
        SourceEntityId      INT               NOT NULL,
        TargetEntityType    NVARCHAR(100)     NOT NULL,
        TargetEntityId      INT               NOT NULL,
        CreatedAt           DATETIME2         NOT NULL CONSTRAINT DF_EntityLinks_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt           DATETIME2         NULL,
        IsDeleted           BIT               NOT NULL CONSTRAINT DF_EntityLinks_IsDeleted DEFAULT (0),
        DeletedAt           DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shared.EntityLinks') AND name = 'IX_EntityLinks_Source')
    CREATE INDEX IX_EntityLinks_Source ON shared.EntityLinks(UserId, SourceEntityType, SourceEntityId) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shared.EntityLinks') AND name = 'IX_EntityLinks_Target')
    CREATE INDEX IX_EntityLinks_Target ON shared.EntityLinks(UserId, TargetEntityType, TargetEntityId) WHERE IsDeleted = 0;
GO

-- Links are undirected ("related to"): rows are stored in canonical order (the ordinally smaller
-- Type/Id pair is always the Source), so this one unique index rejects duplicates in either direction.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shared.EntityLinks') AND name = 'UX_EntityLinks_Pair')
    CREATE UNIQUE INDEX UX_EntityLinks_Pair
        ON shared.EntityLinks(UserId, SourceEntityType, SourceEntityId, TargetEntityType, TargetEntityId)
        WHERE IsDeleted = 0;
GO

-- Quick Add capture inbox: anything captured from anywhere lands here first, tagged with the module it's
-- headed for (Kind). Each module's own screens later "process" an item into a real entity of that module.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('shared.InboxItems'))
BEGIN
    CREATE TABLE shared.InboxItems
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_InboxItems PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_InboxItems_Users REFERENCES shared.Users(Id),
        Kind            NVARCHAR(20)      NOT NULL CONSTRAINT CK_InboxItems_Kind CHECK (Kind IN ('Task', 'Note', 'Journal', 'Idea')),
        Title           NVARCHAR(300)     NOT NULL,
        Notes           NVARCHAR(MAX)     NULL,
        ProcessedAt     DATETIME2         NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_InboxItems_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_InboxItems_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shared.InboxItems') AND name = 'IX_InboxItems_User_Kind')
    CREATE INDEX IX_InboxItems_User_Kind ON shared.InboxItems(UserId, Kind, ProcessedAt) WHERE IsDeleted = 0;
GO

-- Upgrade path for tables created before primary keys were named explicitly: SQL Server's auto-generated
-- names (PK__Users__3214EC07...) differ per database, which made every re-scaffold churn AppDbContext.cs.
DECLARE @renamePks NVARCHAR(MAX) = N'';
SELECT @renamePks += N'EXEC sp_rename N''shared.' + kc.name + N''', N''PK_' + t.name + N''', N''OBJECT'';'
FROM sys.key_constraints kc
JOIN sys.tables t ON t.object_id = kc.parent_object_id
WHERE kc.type = 'PK' AND SCHEMA_NAME(t.schema_id) = 'shared' AND kc.name <> N'PK_' + t.name;
EXEC sp_executesql @renamePks;
GO

-- Settings + account (Session 37). Preferences live on the user row; what can be switched off and the password
-- recovery codes get their own small tables.
--   TimeZone      the IANA zone repeating events and reminders follow (NULL = whatever the device says).
--   BaseCurrency  ISO 4217 code money is reported in (Finance, Phase 2); NULL until chosen.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('shared.Users') AND name = 'TimeZone')
    ALTER TABLE shared.Users ADD
        TimeZone        NVARCHAR(64)      NULL,
        BaseCurrency    CHAR(3)           NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Users_BaseCurrency')
    ALTER TABLE shared.Users ADD CONSTRAINT CK_Users_BaseCurrency
        CHECK (BaseCurrency IS NULL OR BaseCurrency COLLATE Latin1_General_BIN LIKE '[A-Z][A-Z][A-Z]');
GO

-- Modules a user has switched off (Blueprint principle 9: modularity). Hidden = left out of the navigation and My
-- Day; the data stays and the pages still open. Turning one back on soft-deletes the row (filtered unique index).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('shared.UserHiddenModules'))
BEGIN
    CREATE TABLE shared.UserHiddenModules
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_UserHiddenModules PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_UserHiddenModules_Users REFERENCES shared.Users(Id),
        ModuleKey       NVARCHAR(30)      NOT NULL CONSTRAINT CK_UserHiddenModules_ModuleKey
                            CHECK (ModuleKey IN ('Calendar', 'Reminders', 'Goals', 'Tasks', 'Projects', 'Habits', 'Journal', 'Story', 'Documents', 'Learning', 'Career', 'Finance', 'Health')),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_UserHiddenModules_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_UserHiddenModules_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shared.UserHiddenModules') AND name = 'UX_UserHiddenModules_User_Module')
    CREATE UNIQUE INDEX UX_UserHiddenModules_User_Module ON shared.UserHiddenModules(UserId, ModuleKey) WHERE IsDeleted = 0;
GO

-- Life areas a user has switched off: no longer offered in pickers or shown in the Life balance card. Things already
-- filed under one keep it.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('shared.UserHiddenLifeAreas'))
BEGIN
    CREATE TABLE shared.UserHiddenLifeAreas
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_UserHiddenLifeAreas PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_UserHiddenLifeAreas_Users REFERENCES shared.Users(Id),
        LifeAreaId      INT               NOT NULL CONSTRAINT FK_UserHiddenLifeAreas_LifeAreas REFERENCES shared.LifeAreas(Id),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_UserHiddenLifeAreas_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_UserHiddenLifeAreas_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shared.UserHiddenLifeAreas') AND name = 'UX_UserHiddenLifeAreas_User_Area')
    CREATE UNIQUE INDEX UX_UserHiddenLifeAreas_User_Area ON shared.UserHiddenLifeAreas(UserId, LifeAreaId) WHERE IsDeleted = 0;
GO

-- One-time password recovery codes (no email is sent anywhere, so these are how a forgotten password is reset).
-- Shown once — at registration or when regenerated in Settings — and stored only as a SHA-256 hash: each code
-- carries 80 random bits, so a fast hash is enough and lets a reset look the code up directly. Using one sets
-- UsedAt; regenerating soft-deletes the old set.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('shared.RecoveryCodes'))
BEGIN
    CREATE TABLE shared.RecoveryCodes
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RecoveryCodes PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_RecoveryCodes_Users REFERENCES shared.Users(Id),
        CodeHash        CHAR(64)          NOT NULL,
        UsedAt          DATETIME2         NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_RecoveryCodes_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_RecoveryCodes_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shared.RecoveryCodes') AND name = 'IX_RecoveryCodes_User_Hash')
    CREATE INDEX IX_RecoveryCodes_User_Hash ON shared.RecoveryCodes(UserId, CodeHash) WHERE IsDeleted = 0 AND UsedAt IS NULL;
GO

-- Session 40: Documents can be switched off too; Session 48: Learning; Session 52: Career; Session 56: Finance; Session 62: Health. Databases created before then have a shorter
-- module list, so the CHECK is dropped and re-added whenever it lacks the newest key.
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_UserHiddenModules_ModuleKey' AND definition NOT LIKE '%Health%')
    ALTER TABLE shared.UserHiddenModules DROP CONSTRAINT CK_UserHiddenModules_ModuleKey;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_UserHiddenModules_ModuleKey')
    ALTER TABLE shared.UserHiddenModules ADD CONSTRAINT CK_UserHiddenModules_ModuleKey
        CHECK (ModuleKey IN ('Calendar', 'Reminders', 'Goals', 'Tasks', 'Projects', 'Habits', 'Journal', 'Story', 'Documents', 'Learning', 'Career', 'Finance', 'Health'));
GO

-- Attachments (Session 41): files on any item (goals and tasks first; journal memories, receipts, travel documents
-- later). Same file mechanism as documents.DocumentFiles — bytes in IFileStore, only the description here — and the
-- same open EntityType/EntityId pair as EntityLinks and Reminders (type strings from ILinkableEntityProvider).
-- A module's delete soft-deletes its item's attachments; the bytes stay until permanent deletion (Session 60).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('shared.Attachments'))
BEGIN
    CREATE TABLE shared.Attachments
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Attachments PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Attachments_Users REFERENCES shared.Users(Id),
        EntityType      NVARCHAR(100)     NOT NULL,
        EntityId        INT               NOT NULL,
        StoredName      NVARCHAR(50)      NOT NULL,
        OriginalName    NVARCHAR(255)     NOT NULL,
        ContentType     NVARCHAR(100)     NOT NULL,
        SizeBytes       BIGINT            NOT NULL CONSTRAINT CK_Attachments_SizeBytes CHECK (SizeBytes > 0),
        Sha256          CHAR(64)          NOT NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Attachments_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Attachments_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_Attachments_StoredName CHECK (StoredName COLLATE Latin1_General_BIN NOT LIKE '%[^0-9a-z.]%' AND LEN(StoredName) >= 32),
        CONSTRAINT CK_Attachments_Sha256 CHECK (Sha256 COLLATE Latin1_General_BIN NOT LIKE '%[^0-9A-F]%')
    );
END
GO

-- A name on disk belongs to exactly one row, ever (live or deleted) — as for document files.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shared.Attachments') AND name = 'UX_Attachments_StoredName')
    CREATE UNIQUE INDEX UX_Attachments_StoredName ON shared.Attachments(StoredName);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shared.Attachments') AND name = 'IX_Attachments_Entity')
    CREATE INDEX IX_Attachments_Entity ON shared.Attachments(UserId, EntityType, EntityId) WHERE IsDeleted = 0;
GO

-- Vault activity (Session 41): every unlock (and failed unlock), every sensitive file opened, every document taken
-- out of the vault. Append-only history the user can read in Settings; Health and Safety log here too later.
-- EntityType/EntityId say what was opened (NULL for an unlock); Detail is the file name; ClientAddress where from.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('shared.VaultAccessLog'))
BEGIN
    CREATE TABLE shared.VaultAccessLog
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_VaultAccessLog PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_VaultAccessLog_Users REFERENCES shared.Users(Id),
        Action          NVARCHAR(20)      NOT NULL CONSTRAINT CK_VaultAccessLog_Action
                            CHECK (Action IN ('Unlocked', 'UnlockFailed', 'Opened', 'Unprotected')),
        EntityType      NVARCHAR(100)     NULL,
        EntityId        INT               NULL,
        Detail          NVARCHAR(255)     NULL,
        ClientAddress   NVARCHAR(45)      NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_VaultAccessLog_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_VaultAccessLog_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL,
        CONSTRAINT CK_VaultAccessLog_Entity CHECK ((EntityType IS NULL AND EntityId IS NULL) OR (EntityType IS NOT NULL AND EntityId IS NOT NULL))
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shared.VaultAccessLog') AND name = 'IX_VaultAccessLog_User_CreatedAt')
    CREATE INDEX IX_VaultAccessLog_User_CreatedAt ON shared.VaultAccessLog(UserId, CreatedAt DESC) WHERE IsDeleted = 0;
GO

-- Life vision (Session 46): one free-text statement of where the user is heading — the premise of their story,
-- shown atop Goals and the Life Story. One per user, so a column rather than a table; NULL until written.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('shared.Users') AND name = 'LifeVision')
    ALTER TABLE shared.Users ADD LifeVision NVARCHAR(2000) NULL;
GO

-- Contacts (Session 51): the one list of people — Career's network, Family's directory (Session 72), Safety's
-- emergency contacts and Community's mentoring all point here; no module keeps its own people list. Groupings
-- ("Mentor", "Recruiter", "Family") are tags. LastContactedOn is the last day you were in touch — set by hand for
-- now; Family's logged interactions (Session 72) keep it current later.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('shared.Contacts'))
BEGIN
    CREATE TABLE shared.Contacts
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Contacts PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_Contacts_Users REFERENCES shared.Users(Id),
        Name            NVARCHAR(200)     NOT NULL CONSTRAINT CK_Contacts_Name CHECK (LEN(Name) > 0),
        Organisation    NVARCHAR(200)     NULL,
        JobTitle        NVARCHAR(200)     NULL,
        Email           NVARCHAR(320)     NULL     CONSTRAINT CK_Contacts_Email CHECK (Email IS NULL OR Email LIKE '%_@_%'),
        Phone           NVARCHAR(50)      NULL,
        Notes           NVARCHAR(4000)    NULL,
        LastContactedOn DATE              NULL,
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_Contacts_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_Contacts_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

-- Not unique: two people can share a name.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shared.Contacts') AND name = 'IX_Contacts_User_Name')
    CREATE INDEX IX_Contacts_User_Name ON shared.Contacts(UserId, Name) WHERE IsDeleted = 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('shared.ContactTags'))
BEGIN
    CREATE TABLE shared.ContactTags
    (
        Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ContactTags PRIMARY KEY,
        UserId          INT               NOT NULL CONSTRAINT FK_ContactTags_Users REFERENCES shared.Users(Id),
        ContactId       INT               NOT NULL CONSTRAINT FK_ContactTags_Contacts REFERENCES shared.Contacts(Id),
        TagId           INT               NOT NULL CONSTRAINT FK_ContactTags_Tags REFERENCES shared.Tags(Id),
        CreatedAt       DATETIME2         NOT NULL CONSTRAINT DF_ContactTags_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt       DATETIME2         NULL,
        IsDeleted       BIT               NOT NULL CONSTRAINT DF_ContactTags_IsDeleted DEFAULT (0),
        DeletedAt       DATETIME2         NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('shared.ContactTags') AND name = 'UX_ContactTags_Contact_Tag')
    CREATE UNIQUE INDEX UX_ContactTags_Contact_Tag ON shared.ContactTags(ContactId, TagId) WHERE IsDeleted = 0;
GO
