<?php
// Copy to config.secret.php and fill in real values.
// config.secret.php is gitignored — never commit it.
return [
  'db_user' => 'YOUR_DB_USER',
  'db_pass' => 'YOUR_DB_PASS',

  /**
   * Optional: single column on t_report for filing PersonID when not in t_report_member.
   * If unset, every known column that exists on t_report is OR’d (ReporterID, ReportWriterID, SubmittedByPersonID, …).
   * Set to false for roster-only. PWV tree rows usually have no person column — attribution is the report.
   */
  // 't_report_person_column' => 'ReporterID',

  /**
   * Optional: column on t_report_member that equals t_member.PersonID for each party row (roster).
   * PWV: PersonID is correct (auto-detect uses it first). Set this only if auto-detect picks the wrong
   * column—for example MemberPersonID first would inflate COUNT(DISTINCT …) to roster row count (e.g. 80)
   * so each person’s share becomes 1/80 of trees (~1 tree when 80 trees were cleared on the report).
   *
   * If the table has both PersonID and MemberPersonID, the dashboard uses both: roster match is
   * (PersonID = me OR MemberPersonID = me), and party size is LEAST(distinct PersonID count, distinct
   * MemberPersonID count) when both are positive so row-level surrogates do not shrink your share.
   */
  // 't_report_member_person_column' => 'PersonID',

  /**
   * Optional: quantity column on t_rpt_trail_clearing. Tree-size lines use tree count; brushing/limbing lines use feet.
   * If unset, auto-detects NumCleared, Qty, or Quantity.
   */
  // 't_trail_clearing_qty_column' => 'NumCleared',

  /**
   * Optional: TrailClearingID values that mean brushing/limbing (feet), excluded from “trees cleared.”
   * Default [6, 7, 8]. Tree totals include NULL/0 IDs and any ID not in this list.
   */
  // 'trail_clearing_brush_ids' => [6, 7, 8],

  /**
   * Optional: PersonID column on t_rpt_trail_clearing for member-scoped tree counts. Set false to disable.
   * Legacy: t_tree_down_person_column is still read as a fallback column name on t_rpt_trail_clearing.
   */
  // 't_trail_clearing_person_column' => 'PersonID',

  /**
   * Optional: t_member column updated to CURRENT_TIMESTAMP when session.php validates a remembered token.
   * Default last_login_at (add with sql/05-t-member-last-login-at.sql). Set to your legacy column name if needed.
   */
  // 't_member_last_login_column' => 'LastLogin',

  /**
   * Optional: after session.php / verify-otp success, set app_sync_meta.pending_after_session_at when
   * last_successful_pull_at is older than aws_sync_min_interval_seconds (default 3600, minimum 300).
   * A cron job on DreamHost must read that flag and run your AWS→DreamHost sync script — see
   * product-plan/aws-mysql-sync-plan.md and sql/06-app-sync-meta.sql.
   */
  // 'aws_sync_session_nudge' => true,
  // 'aws_sync_min_interval_seconds' => 3600,
];
