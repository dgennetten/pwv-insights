#!/usr/bin/env bash
# Pull the latest VOLDB backup from clrdvol.org and rebuild pwvinsights tables.
#
# Runs on: local machine OR DreamHost cron — same script, same logic.
#
# Usage (local):
#   bash scripts/pull-and-repair.sh
#
# Usage (DreamHost cron, absolute paths required):
#   0 3 * * * SSH_KEY=/home/dgennetten/.ssh/dg-voldb.pem \
#             /bin/bash /home/dgennetten/db-repair/scripts/pull-and-repair.sh \
#             >> /home/dgennetten/db-repair/cron.log 2>&1
#
# Credentials (checked in order):
#   1. DB_USER / DB_PASS environment variables
#   2. db/.db-credentials  — key=value file:
#        DB_USER=dgennetten
#        DB_PASS=yourpassword
#      (db/ is gitignored — never commit this file)
#   3. Interactive prompt (local only — not usable from cron)
#
# SSH key: defaults to ~/dg.pem (local) or set SSH_KEY= for a different path.

set -euo pipefail

# Cron strips PATH to bare minimum — be explicit.
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DB_DIR="$PROJECT_ROOT/db"

SSH_KEY="${SSH_KEY:-$HOME/dg.pem}"
SSH_HOST="gennetten1_v3bhmjbmxrj3@clrdvol.org"
BACKUP_DIR="/var/www/vhosts/clrdvol.org/backups/database/latest"

DB_HOST="mysql.gennetten.com"
DB_NAME="pwvinsights"

echo ""
echo "=== pull-and-repair  $(date '+%Y-%m-%d %H:%M:%S') ==="

# ── Credentials ───────────────────────────────────────────────────────────────

CREDS_FILE="$DB_DIR/.db-credentials"
DB_USER="${DB_USER:-}"
DB_PASS="${DB_PASS:-}"

if [[ -f "$CREDS_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$CREDS_FILE"
fi

if [[ -z "$DB_USER" ]]; then
  read -r -p "MySQL user [$DB_HOST/$DB_NAME]: " DB_USER
fi
if [[ -z "$DB_PASS" ]]; then
  read -r -s -p "MySQL password: " DB_PASS
  echo
fi

# Write a temp my.cnf so the password never appears on the command line or in ps output
MYSQL_CNF=$(mktemp)
chmod 600 "$MYSQL_CNF"
printf '[client]\npassword=%s\n' "$DB_PASS" > "$MYSQL_CNF"
trap 'rm -f "$MYSQL_CNF"' EXIT

mysql_cmd() {
  mysql --defaults-extra-file="$MYSQL_CNF" -h "$DB_HOST" -u "$DB_USER" "$@"
}

# ── Validate SSH key ──────────────────────────────────────────────────────────

if [[ ! -f "$SSH_KEY" ]]; then
  echo "ERROR: SSH key not found: $SSH_KEY" >&2
  echo "       Set SSH_KEY=/path/to/dg.pem or place dg.pem in your home directory." >&2
  exit 1
fi
chmod 600 "$SSH_KEY" 2>/dev/null || true

# ── Step 1: find latest backup on remote ─────────────────────────────────────

echo "▶  Finding latest backup on $SSH_HOST…"
REMOTE_FILE=$(ssh -i "$SSH_KEY" \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=accept-new \
  -o ConnectTimeout=15 \
  "$SSH_HOST" \
  "ls -1t $BACKUP_DIR/*.sql.gz 2>/dev/null | head -1")

if [[ -z "$REMOTE_FILE" ]]; then
  echo "ERROR: No .sql.gz found in $BACKUP_DIR" >&2
  exit 1
fi

FILENAME="$(basename "$REMOTE_FILE")"
LOCAL_GZ="$DB_DIR/$FILENAME"
LOCAL_SQL="${LOCAL_GZ%.gz}"

echo "   Remote: $REMOTE_FILE"

# ── Step 2: download (skip if already cached) ─────────────────────────────────

if [[ -f "$LOCAL_GZ" || -f "$LOCAL_SQL" ]]; then
  echo "   Already have $FILENAME — skipping download."
else
  echo "▶  Downloading $FILENAME…"
  scp -i "$SSH_KEY" \
    -o StrictHostKeyChecking=accept-new \
    "$SSH_HOST:$REMOTE_FILE" "$LOCAL_GZ"
  echo "   ✓ Saved to $LOCAL_GZ"
fi

# ── Step 3: decompress ────────────────────────────────────────────────────────

if [[ ! -f "$LOCAL_SQL" ]]; then
  echo "▶  Decompressing…"
  gunzip -k "$LOCAL_GZ"
  echo "   ✓ $(basename "$LOCAL_SQL")"
fi

# ── Step 4: generate repair SQL ───────────────────────────────────────────────

echo "▶  Generating repair SQL…"
bash "$DB_DIR/generate-repair-sql.sh" "$LOCAL_SQL"
echo "   ✓ repair-data.sql written"

# ── Step 5: show current row counts ──────────────────────────────────────────

echo "▶  Current pwvinsights state:"
mysql_cmd "$DB_NAME" --table -e "
  SELECT 't_member'        AS \`table\`, COUNT(*) AS \`rows\` FROM t_member
  UNION ALL SELECT 't_report',        COUNT(*) FROM t_report
  UNION ALL SELECT 't_report_member', COUNT(*) FROM t_report_member;
" 2>/dev/null || echo "   (could not query — continuing anyway)"

# ── Step 6: apply repair SQL ──────────────────────────────────────────────────

echo "▶  Applying repair to $DB_NAME on $DB_HOST…"
mysql_cmd "$DB_NAME" < "$DB_DIR/repair-data.sql"

# ── Step 7: confirm final row counts ─────────────────────────────────────────

echo ""
echo "▶  New pwvinsights state:"
mysql_cmd "$DB_NAME" --table -e "
  SELECT 't_member'        AS \`table\`, COUNT(*) AS \`rows\` FROM t_member
  UNION ALL SELECT 't_report',        COUNT(*) FROM t_report
  UNION ALL SELECT 't_report_member', COUNT(*) FROM t_report_member;
  SELECT CONCAT('Last t_report ID: ', MAX(ReportID)) AS info FROM t_report;
"

# ── Step 8: clean up decompressed SQL (keep .gz for re-runs) ─────────────────

echo "▶  Cleaning up decompressed SQL…"
rm -f "$LOCAL_SQL"

# Also remove any .gz files older than 7 days to avoid accumulation
find "$DB_DIR" -maxdepth 1 -name "fs_VOLDB_*.sql.gz" -mtime +7 -delete 2>/dev/null || true

echo ""
echo "✓  Repair complete — $(date '+%Y-%m-%d %H:%M:%S')"
