-- Cache table for AI-generated trail report summaries.
-- Keyed on wksite_id + a sorted comma-separated string of the report IDs used,
-- so the cache is invalidated automatically when newer reports arrive.
CREATE TABLE IF NOT EXISTS trail_ai_summary (
  wksite_id       INT UNSIGNED  NOT NULL,
  report_ids_key  VARCHAR(200)  NOT NULL,
  summary         TEXT          NOT NULL,
  generated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (wksite_id, report_ids_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
