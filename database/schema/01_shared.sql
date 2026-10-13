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
        Id              INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
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
        Id              INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
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
        Id              INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
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
        Id                  INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
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
