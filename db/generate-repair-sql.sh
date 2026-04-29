#!/usr/bin/env bash
# Generates db/repair-data.sql from the AWS MariaDB dump.
#
# Modes
# ─────
#   --upsert        (default) INSERT … ON DUPLICATE KEY UPDATE per table.
#                   Preserves any rows in pwvinsights that are NOT in the dump
#                   (e.g. reports filed after the dump timestamp that arrived via
#                   sync-aws-csv.php) and never overwrites t_member.last_login_at.
#                   Use this for routine daily/weekly cron runs.
#
#   --full-replace  DELETE all rows first, then INSERT — complete mirror of the dump.
#                   Use only for one-time corruption repair when you need to
#                   hard-reset to the dump's exact state.
#
# Usage:
#   bash db/generate-repair-sql.sh [--upsert|--full-replace] [path/to/dump.sql]
#
# After generating repair-data.sql, apply it:
#   mysql -h mysql.gennetten.com -u USER -p pwvinsights < db/repair-data.sql
#
# The SQL dump covers data through its export timestamp.
# To also apply newer rows from the CSVs, run sync-aws-csv.php afterwards.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Parse flags and positional arg ────────────────────────────────────────────

MODE="upsert"
DUMP=""
for arg in "$@"; do
  case "$arg" in
    --upsert)        MODE="upsert" ;;
    --full-replace)  MODE="full-replace" ;;
    --*)             echo "Unknown flag: $arg" >&2; exit 1 ;;
    *)               [[ -z "$DUMP" ]] && DUMP="$arg" ;;
  esac
done

DUMP="${DUMP:-$SCRIPT_DIR/fs_VOLDB_week.16.2026-04-13_10h00m.sql}"
OUTPUT="$SCRIPT_DIR/repair-data.sql"

if [[ ! -f "$DUMP" ]]; then
  echo "ERROR: Dump file not found: $DUMP" >&2
  echo "Pass the path as the first argument or place it in db/." >&2
  exit 1
fi

DUMP_BASENAME="$(basename "$DUMP")"
echo "Source: $DUMP  (mode: $MODE)"
echo "Output: $OUTPUT"

# ── helpers ──────────────────────────────────────────────────────────────────

# Extract INSERT rows between LOCK TABLES `table` WRITE; and UNLOCK TABLES;
extract_table() {
  local table="$1"
  awk -v tbl="$table" '
    $0 ~ ("^LOCK TABLES `" tbl "` WRITE;$") { inside=1; next }
    inside && /^UNLOCK TABLES;$/             { inside=0; next }
    inside && /^\/\*!40000/                  { next }
    inside                                   { print }
  ' "$DUMP"
}

# Extract ordered column list from CREATE TABLE `table` in the dump.
# Returns comma-separated names (no backticks).
get_columns() {
  local table="$1"
  grep -A10000 "^CREATE TABLE \`${table}\`" "$DUMP" 2>/dev/null | awk '
    NR==1 { next }
    /^  `[^`]+`/ {
      line = $0
      sub(/^  `/, "", line)
      sub(/`.*/, "", line)
      cols = (cols == "") ? line : cols "," line
    }
    /^\) ENGINE/ { exit }
    END { print cols }
  ' || true
}

# Extract PRIMARY KEY column(s) for a table.
# Returns comma-separated names (no backticks), e.g. "ReportID" or "ReportID,PersonID".
get_pk_columns() {
  local table="$1"
  grep -A10000 "^CREATE TABLE \`${table}\`" "$DUMP" 2>/dev/null | awk '
    NR==1 { next }
    /PRIMARY KEY/ {
      line = $0
      gsub(/.*PRIMARY KEY \(/, "", line)
      gsub(/\).*/, "", line)
      gsub(/`/, "", line)
      gsub(/ /, "", line)
      print line
      exit
    }
    /^\) ENGINE/ { exit }
  ' || true
}

# Build the ON DUPLICATE KEY UPDATE clause.
# $1: comma-separated column names
# $2: pipe-separated names to exclude (typically PKs + DreamHost-only columns)
build_dup_update() {
  local cols="$1"
  local exclude="${2:-}"
  local result=""
  IFS=',' read -ra arr <<< "$cols"
  for col in "${arr[@]}"; do
    [[ "|${exclude}|" == *"|${col}|"* ]] && continue
    result="${result:+$result,}\`${col}\`=VALUES(\`${col}\`)"
  done
  echo "$result"
}

# Emit upsert SQL for a single table.
# $1: table name
# $2: pipe-separated extra columns to exclude from ON DUPLICATE KEY UPDATE
emit_upsert() {
  local table="$1"
  local extra_exclude="${2:-}"

  local cols
  cols=$(get_columns "$table")
  if [[ -z "$cols" ]]; then
    echo "-- WARNING: Could not find CREATE TABLE for $table in dump — using INSERT IGNORE fallback"
    extract_table "$table" | sed 's/^INSERT INTO /INSERT IGNORE INTO /'
    return
  fi

  local pk_cols
  pk_cols=$(get_pk_columns "$table")
  # Build exclude list: PKs + any extra columns (e.g. last_login_at)
  local exclude
  exclude=$(echo "${pk_cols}|${extra_exclude}" | sed 's/^|//; s/|$//')

  # Build backtick-quoted column list for explicit INSERT column names
  local col_list
  col_list=$(echo "$cols" | sed "s/,/\`,\`/g; s/^/\`/; s/$/\`/")

  local upd
  upd=$(build_dup_update "$cols" "$exclude")

  if [[ -z "$upd" ]]; then
    echo "-- WARNING: No update columns for $table — using INSERT IGNORE"
    extract_table "$table" | sed 's/^INSERT INTO /INSERT IGNORE INTO /'
    return
  fi

  # Add explicit column list to INSERT (needed for tables with DreamHost-only columns
  # like t_member.last_login_at that are absent from the dump's INSERT VALUES).
  # Then append ON DUPLICATE KEY UPDATE on the closing semicolon.
  extract_table "$table" \
    | sed "s/^INSERT INTO \`${table}\` VALUES /INSERT INTO \`${table}\` (${col_list}) VALUES /g" \
    | sed "s/;$/ ON DUPLICATE KEY UPDATE ${upd};/g"
}

# ── begin output ─────────────────────────────────────────────────────────────

{

if [[ "$MODE" == "upsert" ]]; then

cat <<HEADER
-- ============================================================
-- pwvinsights data sync (upsert mode)
-- Generated by: db/generate-repair-sql.sh --upsert
-- Source dump:  $DUMP_BASENAME
-- ============================================================
-- Upserts t_member, t_report, t_report_member, and t_rpt_*
-- from the AWS dump WITHOUT deleting existing rows first.
--
-- Rows in pwvinsights that are newer than the dump (e.g. from
-- sync-aws-csv.php) are preserved.  t_member.last_login_at is
-- never overwritten.
--
-- To hard-reset to the dump's exact state instead, regenerate
-- with --full-replace (one-time corruption repair only).
-- ============================================================

USE pwvinsights;
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET UNIQUE_CHECKS     = 0;
SET AUTOCOMMIT        = 0;

-- ── t_member (upsert, skip last_login_at) ────────────────────────────────────
HEADER

  emit_upsert "t_member" "last_login_at"

  echo ""
  echo "-- ── t_report ────────────────────────────────────────────────────────────────"
  emit_upsert "t_report"

  echo ""
  echo "-- ── t_report_member ─────────────────────────────────────────────────────────"
  emit_upsert "t_report_member"

  echo ""
  echo "-- ── t_rpt_* detail tables ───────────────────────────────────────────────────"
  for tbl in \
    t_rpt_campsite \
    t_rpt_extra \
    t_rpt_maintained_to_std \
    t_rpt_maintenance_need \
    t_rpt_notrees \
    t_rpt_observation \
    t_rpt_other_campsite \
    t_rpt_parking_lot \
    t_rpt_sign_need \
    t_rpt_sign_work \
    t_rpt_trail_clearing \
    t_rpt_trail_work \
    t_rpt_tree_down \
    t_rpt_violation \
    t_rpt_weed
  do
    echo ""
    echo "-- ── $tbl"
    emit_upsert "$tbl"
  done

cat <<FOOTER

-- Ensure last_login_at column exists (no-op if already present)
SET @_add_ll = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE t_member ADD COLUMN last_login_at TIMESTAMP NULL DEFAULT NULL',
    'SELECT 1')
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 't_member'
    AND COLUMN_NAME  = 'last_login_at'
);
PREPARE _add_ll_stmt FROM @_add_ll;
EXECUTE _add_ll_stmt;
DEALLOCATE PREPARE _add_ll_stmt;

COMMIT;
SET AUTOCOMMIT        = 1;
SET UNIQUE_CHECKS     = 1;
SET FOREIGN_KEY_CHECKS = 1;

SELECT CONCAT(
  'Sync complete (upsert). ',
  't_member: ',             (SELECT COUNT(*) FROM t_member),             ' rows. ',
  't_report: ',             (SELECT COUNT(*) FROM t_report),             ' rows. ',
  't_report_member: ',      (SELECT COUNT(*) FROM t_report_member),      ' rows. ',
  't_rpt_observation: ',    (SELECT COUNT(*) FROM t_rpt_observation),    ' rows. ',
  't_rpt_trail_clearing: ', (SELECT COUNT(*) FROM t_rpt_trail_clearing), ' rows.'
) AS result;
FOOTER

else
  # ── FULL-REPLACE mode (original repair behavior) ──────────────────────────

cat <<HEADER
-- ============================================================
-- ONE-TIME DATA REPAIR for pwvinsights (full-replace mode)
-- Generated by: db/generate-repair-sql.sh --full-replace
-- Source dump:  $DUMP_BASENAME
-- ============================================================
-- Replaces t_member, t_report, and t_report_member with the
-- authoritative data from the AWS dump.
-- Preserves: auth_sessions, auth_login_log, user_preferences.
--
-- WARNING: Any rows newer than the dump (e.g. from recent CSV
-- syncs) will be deleted.  Use --upsert for routine cron runs.
--
-- last_login_at: the column is dropped before insert and re-added
-- after.  To preserve it, back it up first:
--   CREATE TABLE _ll_bk AS SELECT PersonID, last_login_at FROM t_member;
-- Then after applying:
--   UPDATE t_member m JOIN _ll_bk b ON m.PersonID=b.PersonID
--     SET m.last_login_at=b.last_login_at;
--   DROP TABLE _ll_bk;
-- ============================================================

USE pwvinsights;
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET UNIQUE_CHECKS     = 0;
SET AUTOCOMMIT        = 0;

-- Step 1: Clear tables in child→parent order (FK checks off)
DELETE FROM t_rpt_campsite;
DELETE FROM t_rpt_extra;
DELETE FROM t_rpt_maintained_to_std;
DELETE FROM t_rpt_maintenance_need;
DELETE FROM t_rpt_notrees;
DELETE FROM t_rpt_observation;
DELETE FROM t_rpt_other_campsite;
DELETE FROM t_rpt_parking_lot;
DELETE FROM t_rpt_sign_need;
DELETE FROM t_rpt_sign_work;
DELETE FROM t_rpt_trail_clearing;
DELETE FROM t_rpt_trail_work;
DELETE FROM t_rpt_tree_down;
DELETE FROM t_rpt_violation;
DELETE FROM t_rpt_weed;
DELETE FROM t_report_member;
DELETE FROM t_report;
DELETE FROM t_member;

-- Drop app-only column so the 22-column dump INSERT rows match.
SET @_drop_sql = (
  SELECT IF(COUNT(*) > 0,
    'ALTER TABLE t_member DROP COLUMN last_login_at',
    'SELECT 1')
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME  = 't_member'
    AND COLUMN_NAME = 'last_login_at'
);
PREPARE _drop_col FROM @_drop_sql;
EXECUTE _drop_col;
DEALLOCATE PREPARE _drop_col;

-- ── t_member (22 AWS columns) ────────────────────────────────────────────────
HEADER

  extract_table "t_member"

  echo ""
  echo "-- ── t_report ────────────────────────────────────────────────────────────────"
  extract_table "t_report"

  echo ""
  echo "-- ── t_report_member ─────────────────────────────────────────────────────────"
  extract_table "t_report_member"

  echo ""
  echo "-- ── t_rpt_* detail tables ───────────────────────────────────────────────────"
  for tbl in \
    t_rpt_campsite \
    t_rpt_extra \
    t_rpt_maintained_to_std \
    t_rpt_maintenance_need \
    t_rpt_notrees \
    t_rpt_observation \
    t_rpt_other_campsite \
    t_rpt_parking_lot \
    t_rpt_sign_need \
    t_rpt_sign_work \
    t_rpt_trail_clearing \
    t_rpt_trail_work \
    t_rpt_tree_down \
    t_rpt_violation \
    t_rpt_weed
  do
    echo ""
    echo "-- ── $tbl"
    extract_table "$tbl"
  done

cat <<FOOTER

-- Step 2: Add last_login_at if not present
ALTER TABLE t_member ADD COLUMN last_login_at TIMESTAMP NULL DEFAULT NULL;

-- Step 3: Clean up app-side rows whose FKs point to members no longer in t_member
DELETE FROM user_preferences WHERE person_id NOT IN (SELECT PersonID FROM t_member);
DELETE FROM auth_sessions     WHERE person_id NOT IN (SELECT PersonID FROM t_member);

COMMIT;
SET AUTOCOMMIT        = 1;
SET UNIQUE_CHECKS     = 1;
SET FOREIGN_KEY_CHECKS = 1;

SELECT CONCAT(
  'Repair complete (full-replace). ',
  't_member: ',           (SELECT COUNT(*) FROM t_member),           ' rows. ',
  't_report: ',           (SELECT COUNT(*) FROM t_report),           ' rows. ',
  't_report_member: ',    (SELECT COUNT(*) FROM t_report_member),    ' rows. ',
  't_rpt_observation: ',  (SELECT COUNT(*) FROM t_rpt_observation),  ' rows. ',
  't_rpt_trail_clearing: ',(SELECT COUNT(*) FROM t_rpt_trail_clearing),' rows.'
) AS result;
FOOTER

fi

} > "$OUTPUT"

LINES=$(wc -l < "$OUTPUT")
echo "Done. $OUTPUT written ($LINES lines)."
echo ""
echo "Apply with:"
echo "  mysql -h mysql.gennetten.com -u USER -p pwvinsights < \"$OUTPUT\""
if [[ "$MODE" == "upsert" ]]; then
  echo ""
  echo "Reports newer than the dump are preserved in pwvinsights."
  echo "To also apply any rows newer than the dump, run:"
  echo "  php db/sync-aws-csv.php"
fi
