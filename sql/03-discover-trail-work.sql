-- Discovery: where might trail maintenance (brushing, limbing, drainage, etc.) live?
-- Run in MySQL while connected to pwvinsights (or change SCHEMA below).
--
-- Your API already uses child tables of t_report:
--   t_rpt_tree_down (hazards), t_rpt_trail_clearing (cleared), t_rpt_observation, t_rpt_violation
-- Maintenance is likely another t_rpt_* row keyed by ReportID, plus a lu_* type table.

USE pwvinsights;

-- ---------------------------------------------------------------------------
-- 1) Every table named like patrol line-items
-- ---------------------------------------------------------------------------
SELECT TABLE_NAME AS table_name
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME LIKE 't_rpt\_%'
ORDER BY TABLE_NAME;

-- ---------------------------------------------------------------------------
-- 2) All tables that have a ReportID column (children of t_report)
-- ---------------------------------------------------------------------------
SELECT TABLE_NAME AS table_name, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND COLUMN_NAME = 'ReportID'
ORDER BY TABLE_NAME;

-- ---------------------------------------------------------------------------
-- 3) Name hints: work / maintenance / brushing / drainage / limbing / tread
-- ---------------------------------------------------------------------------
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
       TABLE_NAME  LIKE '%work%'
    OR TABLE_NAME  LIKE '%maint%'
    OR TABLE_NAME  LIKE '%brush%'
    OR COLUMN_NAME LIKE '%work%'
    OR COLUMN_NAME LIKE '%maint%'
    OR COLUMN_NAME LIKE '%brush%'
    OR COLUMN_NAME LIKE '%limb%'
    OR COLUMN_NAME LIKE '%drain%'
    OR COLUMN_NAME LIKE '%tread%'
    OR COLUMN_NAME LIKE '%WorkType%'
    OR COLUMN_NAME LIKE '%Qty%'
    OR COLUMN_NAME LIKE '%Quantity%'
    OR COLUMN_NAME LIKE '%Feet%'
    OR COLUMN_NAME LIKE '%Hours%'
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- ---------------------------------------------------------------------------
-- 4) Lookup tables that might define work categories (lu_*)
-- ---------------------------------------------------------------------------
SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME LIKE 'lu\_%'
  AND (
       TABLE_NAME LIKE '%work%'
    OR TABLE_NAME LIKE '%maint%'
    OR TABLE_NAME LIKE '%activity%'
    OR TABLE_NAME LIKE '%task%'
  )
ORDER BY TABLE_NAME;

-- ---------------------------------------------------------------------------
-- After you spot a candidate table from (1)-(4), inspect it:
--   SHOW CREATE TABLE your_candidate\G
--   SELECT * FROM your_candidate LIMIT 5;
--
-- If it has a type ID, join to the matching lu_* table for labels
-- (same pattern as lu_viol_type / lu_obs_type).
