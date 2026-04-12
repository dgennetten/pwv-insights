# AWS MariaDB → DreamHost MySQL sync plan

This app’s **DreamHost** database is a derivative of an **AWS MariaDB** operational database. DreamHost holds PWV Insights–only additions (auth tables, `auth_login_log`, optional `t_member.last_login_at`, and this `app_sync_meta` table). AWS remains the system of record for new members and patrol activity.

Goals:

1. **Catch up** roughly three months of changes since the last full dump.
2. **Stay current** with frequent incremental pulls, **nudged** when users establish or refresh a session (opt-in via `config.secret.php`), while the **heavy work runs in a worker/cron**, not inside the PHP request.

---

## A. One-time catch-up (~3 months)

Prerequisite: on AWS, identify for each replicated table a column that means “this row changed” (e.g. `updated_at`, `modified`, `LastModified`) **or** a monotonic key for insert-only tables (e.g. `ReportID > :max_local`).

### Option A1 — Timestamp window (best when `updated_at` exists)

From a host that can reach **both** databases (your laptop with VPN/SSH tunnel, or a small EC2 job):

1. Record DreamHost watermarks: `SELECT MAX(updated_at) FROM t_report` (repeat per table you sync).
2. Export from AWS only rows newer than **the older of** (local max, `NOW() - INTERVAL 95 DAY`) to cover clock skew and the “~3 months” window:

   ```sql
   -- Example pattern; replace table/column names with real ones from AWS.
   SELECT * FROM t_report
   WHERE updated_at > '2025-01-01 00:00:00'   -- lower bound: just before your dump’s freshness
     AND updated_at <= NOW();
   ```

3. Apply to DreamHost as **`INSERT ... ON DUPLICATE KEY UPDATE`** listing **only AWS-owned columns** — omit `last_login_at` and any DreamHost-only columns on `t_member`.

4. Respect **FK order**: parents before children (e.g. `t_member` before reports that reference members).

### Option A2 — No reliable `updated_at` on AWS

- Ask the AWS admin for a **one-time export** (per table CSV/SQL) for rows with `ReportID > N` / `PersonID > M` where `N`,`M` are maxima on DreamHost, **or** a dated dump slice.
- Alternatively, a **temporary read replica** or **binlog-based export** for the gap period.

### After catch-up

Run `sql/06-app-sync-meta.sql` on DreamHost if not already applied. Set `app_sync_meta.last_successful_pull_at` manually to the watermark you trust (e.g. `NOW()` or max `updated_at` applied), so incremental logic does not re-pull the whole window.

---

## B. Ongoing incremental updates

| Mechanism | Pros | Cons |
|-----------|------|------|
| **Timestamp `WHERE col > :last`** | Simple, works with mysqldump `--where` or `SELECT INTO OUTFILE` | Misses hard deletes unless you add tombstones or periodic full diff |
| **ID range** (`ReportID > :max`) | Easy for append-only | Misses in-row edits |
| **Binlog / CDC** | Correct for edits and deletes | Needs AWS admin cooperation and infra |

Recommended default: **timestamp-based upsert per table**, with a **per-table or global** `last_successful_pull_at` extended only after a transaction commits on DreamHost.

**Never** replace the whole DreamHost database from a dump that includes `DROP TABLE` for shared names. Maintain a **sync manifest** (table → source column → local PK → column allowlist for upsert).

---

## C. Session-triggered nudge (this repo)

Sessions must stay fast. The app **does not** pull from AWS inside `session.php` or `verify-otp.php`. It only:

1. Ensures `app_sync_meta` exists (`sql/06-app-sync-meta.sql`).
2. If `aws_sync_session_nudge` is **true** in `config.secret.php`, and `last_successful_pull_at` is older than `aws_sync_min_interval_seconds` (default 3600), sets `pending_after_session_at = NOW()` on row `id = 1`.

Your **cron job or systemd timer** (every 1–5 minutes) on DreamHost or a build agent should:

1. `SELECT pending_after_session_at, last_successful_pull_at FROM app_sync_meta WHERE id = 1`.
2. If `pending_after_session_at IS NOT NULL` (or simply if data is stale by policy), run the sync script against AWS → DreamHost.
3. On success: `UPDATE app_sync_meta SET pending_after_session_at = NULL, last_successful_pull_at = NOW(), last_pull_error = NULL, last_pull_attempt_at = NOW() WHERE id = 1`.
4. On failure: set `last_pull_error`, optionally leave `pending_after_session_at` set so the next run retries.

That gives users a **best-effort guarantee**: after login, data is refreshed within **cron period + sync duration**, not synchronously in the HTTP response.

See `scripts/sync-aws-to-dreamhost.example.sh` for a skeleton pipeline (fill in hosts, tables, and `WHERE` clauses).

---

## D. Preserving DreamHost-only schema

- **Do not import** tables that exist only on DreamHost: `otp_codes`, `auth_sessions`, `auth_login_log`, `app_sync_meta`.
- For **`t_member`**: upsert from AWS using **only** columns that originate on AWS; never overwrite `last_login_at` (or other local columns) from the import pipeline.
- For **new AWS columns** you need locally: run a one-time `ALTER TABLE` on DreamHost before adding them to the upsert list.

---

## E. What to ask the AWS MariaDB administrator

Send a short requirements list:

1. **Read access** for a dedicated user: `SELECT` on agreed tables (or on **`VIEW`s** you maintain for sync, e.g. `v_sync_report`), no write privileges.
2. **Incremental contract**: for each table, the canonical **“changed at”** or **“new row”** rule (column names and types). Confirm how **deletes** are represented (if at all).
3. **Network**: IP allowlist for DreamHost outbound **or** SSH tunnel / VPN **or** agreed **S3/SFTP push** of incremental exports (no open DB from internet if policy forbids).
4. **TLS** for connections from outside VPC.
5. **Schema change process**: notify you when columns are added/renamed/dropped so the manifest stays valid.
6. **Volume**: approximate rows changed per day to size batch limits and timeouts.
7. **Charset**: `utf8mb4` alignment with DreamHost MySQL.

---

## F. Checklist summary

- [ ] Run `sql/06-app-sync-meta.sql` on DreamHost.
- [ ] Catch-up: apply ~3 months of deltas with column-safe upserts (manifest documented outside this file as you finalize table list).
- [ ] Set `app_sync_meta.last_successful_pull_at` after first good run.
- [ ] Enable `aws_sync_session_nudge` + interval in `config.secret.php` when ready.
- [ ] Schedule cron to drain `pending_after_session_at` and run incremental script.
- [ ] Monitor `last_pull_error` and logs from the worker.
