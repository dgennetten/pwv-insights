<?php
/**
 * TEMPORARY — delete after use or protect behind auth.
 * Read-only discovery for trail maintenance / t_report child tables.
 * Open in browser or: curl https://your-host/.../dev-discover-schema.php
 */
require_once __DIR__ . '/config.php';
header('Content-Type: application/json');

$db = getDb();
$schema = $db->query('SELECT DATABASE()')->fetchColumn();

$q = function (string $sql) use ($db) {
  return $db->query($sql)->fetchAll(PDO::FETCH_ASSOC);
};

$out = [
  'database' => $schema,
  't_rpt_tables' => $q("
    SELECT TABLE_NAME AS name
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 't_rpt\\_%'
    ORDER BY TABLE_NAME
  "),
  'tables_with_report_id' => $q("
    SELECT TABLE_NAME AS name, COLUMN_TYPE
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'ReportID'
    ORDER BY TABLE_NAME
  "),
  'name_hints_work_maint' => $q("
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
        OR COLUMN_NAME LIKE 'WorkType%'
        OR COLUMN_NAME LIKE '%Quantity%'
        OR COLUMN_NAME LIKE '%Qty%'
      )
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  "),
  'lu_lookup_candidates' => $q("
    SELECT TABLE_NAME AS name
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME LIKE 'lu\\_%'
      AND (
           TABLE_NAME LIKE '%work%'
        OR TABLE_NAME LIKE '%maint%'
        OR TABLE_NAME LIKE '%activity%'
        OR TABLE_NAME LIKE '%task%'
      )
    ORDER BY TABLE_NAME
  "),
];

echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
