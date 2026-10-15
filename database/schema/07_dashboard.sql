USE LifeOS_UAT;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Dashboard, My Day & Insights (Month 1, Milestone 7). Owns no tables: the dashboard reads every other module's data
-- through stored procedures in this schema (database/procedures/dashboard.*.sql), so the schema exists only to give
-- those procedures a home that isn't dbo. Nothing to scaffold.

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'dashboard')
    EXEC('CREATE SCHEMA dashboard');
GO
