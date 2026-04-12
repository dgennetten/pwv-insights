#!/usr/bin/env bash
# Example: incremental pull AWS MariaDB → DreamHost MySQL.
# Copy to sync-aws-to-dreamhost.sh (gitignored), fill credentials, chmod +x, run from cron.
#
# Prerequisites:
# - mysql client can reach AWS (VPN/SSH tunnel) and DreamHost.
# - You have replaced TABLE/COLUMN/WHERE with real names from product-plan/aws-mysql-sync-plan.md.
# - DreamHost app_sync_meta exists (sql/06-app-sync-meta.sql).

set -euo pipefail

# --- AWS (read-only source) ---
export AWS_MYSQL_HOST="${AWS_MYSQL_HOST:-aws-rds-or-tunnel-host}"
export AWS_MYSQL_USER="${AWS_MYSQL_USER:-sync_reader}"
export AWS_MYSQL_PWD="${AWS_MYSQL_PWD:?set AWS_MYSQL_PWD}"
export AWS_MYSQL_DB="${AWS_MYSQL_DB:-pwvinsights}"

# --- DreamHost (app DB) ---
export DH_MYSQL_HOST="${DH_MYSQL_HOST:-mysql.gennetten.com}"
export DH_MYSQL_USER="${DH_MYSQL_USER:?}"
export DH_MYSQL_PWD="${DH_MYSQL_PWD:?}"
export DH_MYSQL_DB="${DH_MYSQL_DB:-pwvinsights}"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

# Example: export one table since a watermark (replace column and lower bound).
# WATERMARK="${1:?usage: $0 '2026-01-01 00:00:00'}"
# mysqldump -h "$AWS_MYSQL_HOST" -u"$AWS_MYSQL_USER" -p"$AWS_MYSQL_PWD" \
#   --no-create-info --skip-triggers --single-transaction --quick \
#   --where="updated_at > '$WATERMARK'" \
#   "$AWS_MYSQL_DB" t_report > "$WORKDIR/t_report.sql"

# mysql -h "$DH_MYSQL_HOST" -u"$DH_MYSQL_USER" -p"$DH_MYSQL_PWD" "$DH_MYSQL_DB" < "$WORKDIR/t_report.sql"

# After successful apply of all batches:
# mysql -h "$DH_MYSQL_HOST" -u"$DH_MYSQL_USER" -p"$DH_MYSQL_PWD" "$DH_MYSQL_DB" -e \
#   "UPDATE app_sync_meta SET pending_after_session_at = NULL, last_successful_pull_at = NOW(), last_pull_error = NULL WHERE id = 1"

echo "Edit this script with real tables, WHERE clauses, and upsert strategy before use."
