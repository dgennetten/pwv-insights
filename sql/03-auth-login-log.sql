-- Append-only audit of successful auth (OTP verification and remembered-device session checks).
-- Run on pwvinsights after 02-app-schema.sql if the table is missing.
--
-- If the web DB user created this table as another user, grant INSERT, e.g.:
--   GRANT SELECT, INSERT ON pwvinsights.auth_login_log TO 'your_app_user'@'%';

USE pwvinsights;

CREATE TABLE IF NOT EXISTS auth_login_log (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  person_id     INT UNSIGNED NOT NULL,
  logged_in_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_logged_in (logged_in_at),
  INDEX idx_person_time (person_id, logged_in_at),
  CONSTRAINT fk_auth_login_person
    FOREIGN KEY (person_id) REFERENCES t_member(PersonID) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
