-- DreamHost app DB only: coordinates “pull newer data from AWS MariaDB” with session-triggered nudges.
-- Does not exist on AWS. Run once on pwvinsights after auth migrations.

USE pwvinsights;

CREATE TABLE IF NOT EXISTS app_sync_meta (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY COMMENT 'always 1',
  last_successful_pull_at DATETIME NULL COMMENT 'set by your sync worker after a successful apply',
  last_pull_attempt_at DATETIME NULL COMMENT 'optional: set when worker starts',
  last_pull_error VARCHAR(512) NULL COMMENT 'worker writes last failure message',
  pending_after_session_at DATETIME NULL COMMENT 'session.php / verify-otp set when data may be stale'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO app_sync_meta (id) VALUES (1);
