-- Trial access links — admin-generated, password/OTC-free 7-day access to the app.
--
-- The trial CLOCK STARTS ON FIRST OPEN: a freshly generated link has activated_at
-- and expires_at NULL and stays usable until opened (or revoked). The first time
-- auth/trial-login.php sees the token it stamps activated_at = NOW() and
-- expires_at = NOW() + 7 days. After expires_at the token is rejected.
--
-- The token doubles as the client's session token (stored in localStorage the same
-- way a remembered-device session token is), but it is NOT an auth_sessions row and
-- has no t_member/PersonID — so trial users can never reach member-only endpoints
-- (preferences, member lookup, data-logger submit, admin), which all require a real
-- auth_sessions token joined to t_member.
--
-- config.php::trialLinksEnsureTable() creates this idempotently, so running this file
-- by hand is optional.

CREATE TABLE IF NOT EXISTS trial_links (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token         CHAR(64)        NOT NULL,
  label         VARCHAR(120)    NULL,               -- optional note: who it was sent to
  created_by    INT UNSIGNED    NOT NULL,           -- admin PersonID that generated it
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activated_at  DATETIME        NULL,               -- first-open time (starts the 7-day clock)
  expires_at    DATETIME        NULL,               -- activated_at + 7 days
  revoked       TINYINT(1)      NOT NULL DEFAULT 0,
  use_count     INT UNSIGNED    NOT NULL DEFAULT 0,
  last_used_at  DATETIME        NULL,
  UNIQUE KEY uq_trial_token (token),
  INDEX idx_trial_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
