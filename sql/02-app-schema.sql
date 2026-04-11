-- Run against the pwvinsights database on mysql.gennetten.com
-- Creates the two tables PWV Insights needs for auth.
-- t_member already exists and is the source of truth for valid logins.

USE pwvinsights;

-- Temporary OTP codes (auto-cleaned after use or expiry)
CREATE TABLE IF NOT EXISTS otp_codes (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email      VARCHAR(64)  NOT NULL,
  code       CHAR(6)      NOT NULL,
  expires_at DATETIME     NOT NULL,
  used       TINYINT(1)   NOT NULL DEFAULT 0,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_lookup (email, code),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Session tokens issued after successful OTP verification
CREATE TABLE IF NOT EXISTS auth_sessions (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  person_id  INT UNSIGNED NOT NULL,
  token      CHAR(64)     NOT NULL,
  expires_at DATETIME     NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_token (token),
  CONSTRAINT fk_session_person
    FOREIGN KEY (person_id) REFERENCES t_member(PersonID) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Successful sign-ins (one row per OTP verification); see also 03-auth-login-log.sql
CREATE TABLE IF NOT EXISTS auth_login_log (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  person_id     INT UNSIGNED NOT NULL,
  logged_in_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_logged_in (logged_in_at),
  INDEX idx_person_time (person_id, logged_in_at),
  CONSTRAINT fk_auth_login_person
    FOREIGN KEY (person_id) REFERENCES t_member(PersonID) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
