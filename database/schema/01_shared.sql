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
