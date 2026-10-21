USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Reports (Phase 5, Sessions 90–93). Reports read every other module's data through stored procedures in this schema
-- (database/procedures/reports.*.sql) and own no tables: every figure is computed per request, never stored.
-- (Session 93's saved custom-report definitions will be the first table here.)

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'reports')
    EXEC('CREATE SCHEMA reports');
GO
