# Data Sync How-To

---

## Automated nightly pipeline (current)

`scripts/pull-and-repair.sh` runs nightly at **3 AM server time** on DreamHost:

```
0 3 * * * SSH_KEY=/home/dgennetten/.ssh/dg-voldb.pem \
          /bin/bash /home/dgennetten/db-repair/scripts/pull-and-repair.sh \
          >> /home/dgennetten/db-repair/cron.log 2>&1
```

What it does each run:

1. **Downloads** the newest `.sql.gz` from `clrdvol.org/backups/database/latest/` via SCP.  
   Skips the download if the same filename is already cached in `db/` (idempotent).
2. **Generates** `db/repair-data.sql` via `db/generate-repair-sql.sh --upsert`.  
   Upsert mode uses `INSERT … ON DUPLICATE KEY UPDATE` — updates existing rows to match
   the dump but **never deletes** rows that are in pwvinsights but absent from the dump,
   and never overwrites `t_member.last_login_at`.
3. **Applies** the SQL to `pwvinsights` on `mysql.gennetten.com`.
4. Logs all output to `/home/dgennetten/db-repair/cron.log` on DreamHost.

### Gap window

The upstream dump is generated once per day. The cron at 3 AM downloads whatever is
currently in `/latest/` — if the remote creates its dump at 10 AM, the cron picks up
yesterday's dump and the day's reports appear the following morning. Maximum lag: ~24 hours.

---

## Diagnosing a suspected sync failure

Run the diagnostic from DreamHost (where it can reach the DB):

```bash
bash ~/db-repair/scripts/diagnose-sync.sh 315734   # replace with missing ReportID
```

Or locally to check dump contents only (skips DB queries):

```bash
bash scripts/diagnose-sync.sh 315734 --no-db
```

The script reports: dump age, whether the ReportID is in the dump, DB row counts,
and `app_sync_meta` watermarks.

To check the cron log on DreamHost:

```bash
tail -100 ~/db-repair/cron.log
```

Common failure causes:

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `ERROR: SSH key not found` | `SSH_KEY=` path wrong in cron entry | Update cron entry; verify key path |
| `ERROR: No .sql.gz found` | Remote backup server down or empty | Check clrdvol.org; retry next day |
| Script exits before DB step | `.db-credentials` missing on DreamHost | Create `~/db-repair/db/.db-credentials` |
| DB unchanged after run | Dump filename same as cached copy | Normal — remote hasn't posted a new dump yet |
| Report in dump but not in DB | Script errored during apply step | Check cron.log for MySQL errors; re-run manually |
| Report not in dump | Filed after the dump was taken | Will appear after tomorrow's cron run |

---

## Manual re-run

To pull the latest dump and apply it immediately (from DreamHost SSH):

```bash
bash ~/db-repair/scripts/pull-and-repair.sh
```

To force a fresh download even if the filename is already cached, delete the local copy first:

```bash
rm ~/db-repair/db/fs_VOLDB_*.sql.gz
bash ~/db-repair/scripts/pull-and-repair.sh
```

---

## Emergency full repair

If the DB gets corrupted and you need to hard-reset to the dump's exact state:

```bash
# On DreamHost — regenerate with full-replace mode and apply
bash ~/db-repair/db/generate-repair-sql.sh --full-replace ~/db-repair/db/DUMP.sql
mysql -h mysql.gennetten.com -u dgennetten -p pwvinsights < ~/db-repair/db/repair-data.sql
```

`--full-replace` deletes every row in all replicated tables before inserting from the dump.
Use it only for corruption recovery. Routine runs always use `--upsert` (the default in
`pull-and-repair.sh`).

---

## Long term — direct AWS connection

See `product-plan/aws-mysql-sync-plan.md` for the full design. The short version:

1. **Get read credentials** for the AWS MariaDB from the system administrator.
2. **Write a sync worker** (PHP or Python) that connects to AWS directly and does
   `INSERT … ON DUPLICATE KEY UPDATE` using numeric IDs.
3. **Schedule a cron job** on DreamHost to run the worker periodically.
4. **Enable session nudging** in `config.secret.php`:
   ```php
   'aws_sync_session_nudge' => true,
   'aws_sync_min_interval_seconds' => 3600,
   ```

Once automated with a direct connection, the dump-based pipeline above is no longer needed.
