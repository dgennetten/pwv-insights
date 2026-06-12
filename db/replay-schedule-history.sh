#!/usr/bin/env bash
# One-time recovery: replay AWS dumps in chronological order through
# generate-repair-sql.sh --upsert to rebuild t_schedule/t_schedule_member
# history after it was wiped by an over-aggressive full mirror (2026-06-11).
#
# Each dump corrects its own window (the windowed-mirror logic), so replaying
# oldest → newest reconstructs the accumulated schedule history, including
# upstream member removals that fell within any replayed dump's window.
#
# Usage (on DreamHost):
#   bash ~/db-repair/db/replay-schedule-history.sh dump1.sql.gz dump2.sql.gz ...
#   (pass dumps oldest first)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DB_HOST="mysql.gennetten.com"
DB_NAME="pwvinsights"

source "$SCRIPT_DIR/.db-credentials"

MYSQL_CNF=$(mktemp)
chmod 600 "$MYSQL_CNF"
printf '[client]\npassword=%s\n' "$DB_PASS" > "$MYSQL_CNF"
trap 'rm -f "$MYSQL_CNF"' EXIT

for GZ in "$@"; do
  SQL="${GZ%.gz}"
  echo ""
  echo "=== Replaying $(basename "$GZ") ==="
  [[ -f "$SQL" ]] || gunzip -k "$GZ"
  bash "$SCRIPT_DIR/generate-repair-sql.sh" --upsert "$SQL" > /dev/null
  mysql --defaults-extra-file="$MYSQL_CNF" -h "$DB_HOST" -u "$DB_USER" "$DB_NAME" \
    < "$SCRIPT_DIR/repair-data.sql"
  rm -f "$SQL"
  mysql --defaults-extra-file="$MYSQL_CNF" -h "$DB_HOST" -u "$DB_USER" "$DB_NAME" -N -e \
    "SELECT CONCAT('  t_schedule: ', COUNT(*), ' rows, ',
        (SELECT COUNT(*) FROM t_schedule_member), ' member rows, earliest ',
        IFNULL(MIN(ActivityDate),'-')) FROM t_schedule;"
done

echo ""
echo "Replay complete."
