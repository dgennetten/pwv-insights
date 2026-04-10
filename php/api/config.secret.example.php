<?php
// Copy to config.secret.php and fill in real values.
// config.secret.php is gitignored — never commit it.
return [
  'db_user' => 'YOUR_DB_USER',
  'db_pass' => 'YOUR_DB_PASS',

  /**
   * Optional: single column on t_report for filing PersonID when not in t_report_member.
   * If unset, every known column that exists on t_report is OR’d (ReportWriterID, SubmittedByPersonID, …).
   * Set to false for roster-only. PWV tree rows usually have no person column — attribution is the report.
   */
  // 't_report_person_column' => 'ReportWriterID',

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
];
