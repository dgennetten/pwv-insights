-- Optional: column touched by php/api/auth/session.php on successful remembered-device validation.
-- Run once on pwvinsights. If ALTER fails because the column already exists, skip this file.
--
-- To use a different column name instead, add it yourself and set t_member_last_login_column in config.secret.php.

USE pwvinsights;

ALTER TABLE t_member
  ADD COLUMN last_login_at TIMESTAMP NULL DEFAULT NULL
    COMMENT 'PWV Insights: last session.php validation (remembered device)';
