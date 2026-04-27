#!/usr/bin/env bash
# Diagnose pwvinsights sync state.
#
# Checks: latest local dump age, whether a specific ReportID is present in the
# dump and/or the DreamHost DB, DB row counts, and app_sync_meta watermarks.
#
# Usage:
#   bash scripts/diagnose-sync.sh [REPORT_ID] [--no-db]
#
# Examples:
#   bash scripts/diagnose-sync.sh 315734
#   bash scripts/diagnose-sync.sh 315734 --no-db   # skip DB queries
#   bash scripts/diagnose-sync.sh                  # summary only

set -euo pipefail
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DB_DIR="$PROJECT_ROOT/db"

DB_HOST="mysql.gennetten.com"
DB_NAME="pwvinsights"

TARGET_ID=""
NO_DB=false
for arg in "$@"; do
  [[ "$arg" == "--no-db" ]] && NO_DB=true && continue
  [[ "$arg" =~ ^[0-9]+$ ]] && TARGET_ID="$arg"
done

echo ""
echo "=== pwvinsights sync diagnostic  $(date '+%Y-%m-%d %H:%M:%S') ==="

# ── 1. Locate local dump files ────────────────────────────────────────────────

echo ""
echo "▶  Local dump files in db/:"
DUMP_FILES=$(ls -1t "$DB_DIR"/fs_VOLDB_*.sql.gz "$DB_DIR"/fs_VOLDB_*.sql 2>/dev/null || true)
if [[ -z "$DUMP_FILES" ]]; then
  echo "   WARN: No fs_VOLDB_*.sql or *.sql.gz files found in $DB_DIR"
else
  while IFS= read -r f; do
    [[ -f "$f" ]] && printf "   %-55s  %s\n" "$(basename "$f")" "$(date -r "$f" '+%Y-%m-%d %H:%M')"
  done <<< "$DUMP_FILES"
fi

# ── 2. Dump age check ─────────────────────────────────────────────────────────

LATEST_GZ=$(ls -1t "$DB_DIR"/fs_VOLDB_*.sql.gz 2>/dev/null | head -1 || true)
LATEST_SQL=$(ls -1t "$DB_DIR"/fs_VOLDB_*.sql 2>/dev/null | head -1 || true)
LATEST="${LATEST_SQL:-$LATEST_GZ}"

echo ""
if [[ -n "$LATEST" ]]; then
  # Portable mtime: try GNU stat then BSD stat
  MTIME=$(stat -c %Y "$LATEST" 2>/dev/null || stat -f %m "$LATEST" 2>/dev/null || echo 0)
  NOW=$(date +%s)
  AGE_H=$(( (NOW - MTIME) / 3600 ))
  AGE_D=$(( AGE_H / 24 ))
  echo "▶  Latest dump: $(basename "$LATEST")"
  printf "   Age: %d hours (%d days)\n" "$AGE_H" "$AGE_D"
  if [[ $AGE_H -lt 25 ]]; then
    echo "   ✓ Dump is fresh (< 25 hours)"
  elif [[ $AGE_H -lt 49 ]]; then
    echo "   WARN: Dump is 1-2 days old — cron may have missed a run or remote backup is behind."
    echo "   Reports filed since the dump timestamp will appear after tonight's cron run."
  else
    echo "   WARN: Dump is over 2 days old — cron likely failed or remote backup is stale."
    echo "   Check: tail -50 ~/db-repair/cron.log  (on DreamHost)"
  fi
else
  echo "▶  No dump available — cannot check dump contents."
fi

# ── 3. Search dump for target ReportID ───────────────────────────────────────

if [[ -n "$TARGET_ID" ]]; then
  echo ""
  echo "▶  Searching dump for ReportID $TARGET_ID…"

  # Prefer the uncompressed SQL if available; otherwise decompress temporarily
  SEARCH_FILE="$LATEST_SQL"
  TEMP_SQL=""

  if [[ -z "$SEARCH_FILE" && -n "$LATEST_GZ" ]]; then
    TEMP_SQL="${LATEST_GZ%.gz}"
    echo "   Decompressing $(basename "$LATEST_GZ") to search…"
    gunzip -k "$LATEST_GZ"
    SEARCH_FILE="$TEMP_SQL"
  fi

  if [[ -z "$SEARCH_FILE" ]]; then
    echo "   SKIP: No dump available to search."
  else
    # Look for the ID as a numeric token in INSERT … VALUES rows for t_report
    # The ReportID is the first numeric value in each row tuple
    if grep -q "(${TARGET_ID}," "$SEARCH_FILE" 2>/dev/null; then
      echo "   FOUND: ReportID $TARGET_ID appears in the dump."
      echo "   → The report IS in the dump; if it's missing from DB, re-run pull-and-repair.sh:"
      echo "     bash scripts/pull-and-repair.sh"
    else
      echo "   NOT FOUND: ReportID $TARGET_ID is absent from the dump."
      echo "   → The report was filed AFTER this dump was taken ($(date -r "$SEARCH_FILE" '+%Y-%m-%d %H:%M'))."
      echo "   → It will appear automatically after tonight's cron run once the remote dump is updated."
      echo "   → To pull immediately: bash scripts/pull-and-repair.sh  (on DreamHost)"
    fi

    [[ -n "$TEMP_SQL" ]] && rm -f "$TEMP_SQL"
  fi
fi

# ── 4. DB checks ─────────────────────────────────────────────────────────────

if [[ "$NO_DB" == "true" ]]; then
  echo ""
  echo "▶  Skipping DB checks (--no-db)."
  echo ""
  echo "=== Diagnostic complete ==="
  exit 0
fi

CREDS_FILE="$DB_DIR/.db-credentials"
DB_USER="${DB_USER:-}"
DB_PASS="${DB_PASS:-}"
if [[ -f "$CREDS_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$CREDS_FILE"
fi

if [[ -z "$DB_USER" || -z "$DB_PASS" ]]; then
  echo ""
  echo "▶  No DB credentials — skipping DB checks."
  echo "   Set DB_USER/DB_PASS env vars or create $CREDS_FILE to enable."
  echo ""
  echo "=== Diagnostic complete ==="
  exit 0
fi

MYSQL_CNF=$(mktemp)
chmod 600 "$MYSQL_CNF"
printf '[client]\npassword=%s\n' "$DB_PASS" > "$MYSQL_CNF"
trap 'rm -f "$MYSQL_CNF"' EXIT

mysql_cmd() { mysql --defaults-extra-file="$MYSQL_CNF" -h "$DB_HOST" -u "$DB_USER" "$@"; }

echo ""
echo "▶  DB table counts and max IDs:"
mysql_cmd "$DB_NAME" --table -e "
  SELECT 't_member'        AS \`table\`, COUNT(*) AS \`rows\`, MAX(PersonID) AS max_id  FROM t_member
  UNION ALL
  SELECT 't_report',              COUNT(*),                   MAX(ReportID)             FROM t_report
  UNION ALL
  SELECT 't_report_member',       COUNT(*),                   MAX(ReportID)             FROM t_report_member;
" 2>/dev/null || echo "   (query failed — check credentials and host connectivity)"

echo ""
echo "▶  Five most-recent ReportIDs in DB:"
mysql_cmd "$DB_NAME" -e "
  SELECT ReportID, ActivityDate, ReportDate, ReportWriterID
  FROM t_report ORDER BY ReportID DESC LIMIT 5;
" 2>/dev/null || true

echo ""
echo "▶  app_sync_meta:"
mysql_cmd "$DB_NAME" --table -e "
  SELECT last_successful_pull_at,
         last_pull_attempt_at,
         last_pull_error,
         pending_after_session_at
  FROM app_sync_meta WHERE id = 1;
" 2>/dev/null || echo "   (table not found — run sql/06-app-sync-meta.sql to create it)"

if [[ -n "$TARGET_ID" ]]; then
  echo ""
  echo "▶  Checking DB for ReportID $TARGET_ID:"
  RESULT=$(mysql_cmd "$DB_NAME" -s -N -e \
    "SELECT ReportID FROM t_report WHERE ReportID = ${TARGET_ID} LIMIT 1;" 2>/dev/null || echo "")
  if [[ -n "$RESULT" ]]; then
    echo "   FOUND in DB: ReportID $TARGET_ID is present in pwvinsights. No action needed."
  else
    echo "   MISSING from DB: ReportID $TARGET_ID is not in pwvinsights."
    echo ""
    echo "   Next steps:"
    echo "   1. Check the dump search output above — is it in the dump?"
    echo "   2. If NOT in dump: report is newer than the dump; will appear after tonight's cron run."
    echo "      To pull immediately once the remote has a fresh dump:"
    echo "        bash scripts/pull-and-repair.sh"
    echo "   3. If IN dump but missing from DB: apply now:"
    echo "        bash scripts/pull-and-repair.sh"
    echo "   4. Check DreamHost cron log: tail -50 ~/db-repair/cron.log"
  fi
fi

echo ""
echo "=== Diagnostic complete ==="
