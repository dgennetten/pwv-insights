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
   * Optional: column on t_rpt_tree_down for who cleared that row. If your tree table only has
   * ReportID / TreeSize (no PersonID), leave unset; tree counts follow the parent report only.
   */
  // 't_tree_down_person_column' => 'PersonID',
];
