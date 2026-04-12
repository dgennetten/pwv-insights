-- Run against the pwvinsights database on mysql.gennetten.com
-- Creates the user_preferences table for per-user dashboard settings.
-- Prefs are stored as a JSON blob and merged with defaults client-side.

USE pwvinsights;

CREATE TABLE IF NOT EXISTS user_preferences (
  person_id   INT UNSIGNED NOT NULL PRIMARY KEY,
  prefs       JSON         NOT NULL,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_prefs_person
    FOREIGN KEY (person_id) REFERENCES t_member(PersonID) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
