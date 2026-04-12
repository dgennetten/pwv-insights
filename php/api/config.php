<?php
define('DB_HOST', 'mysql.gennetten.com');
define('DB_NAME', 'pwvinsights');

function getSecrets(): array {
  static $cache = null;
  if ($cache === null) {
    $cache = include __DIR__ . '/config.secret.php';
  }
  return $cache;
}

$secrets = getSecrets();
define('DB_USER', $secrets['db_user']);
define('DB_PASS', $secrets['db_pass']);

define('MAIL_FROM',       'noreply@gennetten.org');
define('MAIL_FROM_NAME',  'PWV Insights');
define('OTP_TTL_MINUTES', 10);

// Hardcoded admin — expand to a DB table when needed
define('ADMIN_EMAIL', 'douglas@gennetten.com');

function getDb(): PDO {
  static $pdo = null;
  if ($pdo === null) {
    $pdo = new PDO(
      'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
      DB_USER,
      DB_PASS,
      [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
  }
  return $pdo;
}

/**
 * Ensures auth_login_log exists (matches sql/03-auth-login-log.sql).
 * Idempotent; safe to call before SELECT or INSERT.
 */
function authLoginLogEnsureTable(PDO $db): void {
  try {
    $db->exec(
      'CREATE TABLE IF NOT EXISTS auth_login_log (
        id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        person_id     INT UNSIGNED NOT NULL,
        logged_in_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_logged_in (logged_in_at),
        INDEX idx_person_time (person_id, logged_in_at),
        CONSTRAINT fk_auth_login_person
          FOREIGN KEY (person_id) REFERENCES t_member(PersonID) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
  } catch (Throwable $e) {
    error_log('auth_login_log ensure table: ' . $e->getMessage());
  }
}

/**
 * Records a successful auth (OTP verification or remembered-device session check).
 */
function authLoginLogRecord(PDO $db, int $personId): void {
  if ($personId < 1) {
    return;
  }
  authLoginLogEnsureTable($db);
  try {
    $db->prepare('INSERT INTO auth_login_log (person_id) VALUES (?)')->execute([$personId]);
  } catch (PDOException $e) {
    $driver = $e->errorInfo !== null ? json_encode($e->errorInfo) : '';
    error_log('auth_login_log insert person_id=' . $personId . ': ' . $e->getMessage() . ' ' . $driver);
  } catch (Throwable $e) {
    error_log('auth_login_log insert person_id=' . $personId . ': ' . $e->getMessage());
  }
}

/**
 * Sets t_member "last login" when session.php validates a remembered-device token.
 * Column name: optional secret t_member_last_login_column (identifier); default last_login_at.
 * No-op if the column does not exist (run sql/05-t-member-last-login-at.sql or point the secret at your column).
 */
function memberLastLoginTouch(PDO $db, int $personId): void {
  if ($personId < 1) {
    return;
  }
  static $resolved = null;
  if ($resolved === false) {
    return;
  }
  if ($resolved === null) {
    $secrets = getSecrets();
    $name = isset($secrets['t_member_last_login_column'])
      ? trim((string) $secrets['t_member_last_login_column'])
      : 'last_login_at';
    if ($name === '' || !preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $name)) {
      $resolved = false;
      return;
    }
    try {
      $chk = $db->prepare(
        'SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1'
      );
      $chk->execute(['t_member', $name]);
      if (!$chk->fetchColumn()) {
        $resolved = false;
        return;
      }
    } catch (Throwable $e) {
      error_log('memberLastLoginTouch column check: ' . $e->getMessage());
      $resolved = false;
      return;
    }
    $resolved = $name;
  }
  try {
    $sql = 'UPDATE t_member SET `' . $resolved . '` = CURRENT_TIMESTAMP WHERE PersonID = ? LIMIT 1';
    $db->prepare($sql)->execute([$personId]);
  } catch (Throwable $e) {
    error_log('memberLastLoginTouch update: ' . $e->getMessage());
  }
}

/**
 * DreamHost-only: app_sync_meta (sql/06-app-sync-meta.sql). Used to nudge a cron worker to pull from AWS.
 */
function syncMetaEnsureTable(PDO $db): void {
  try {
    $db->exec(
      'CREATE TABLE IF NOT EXISTS app_sync_meta (
        id TINYINT UNSIGNED NOT NULL PRIMARY KEY COMMENT \'always 1\',
        last_successful_pull_at DATETIME NULL,
        last_pull_attempt_at DATETIME NULL,
        last_pull_error VARCHAR(512) NULL,
        pending_after_session_at DATETIME NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
    $db->exec('INSERT IGNORE INTO app_sync_meta (id) VALUES (1)');
  } catch (Throwable $e) {
    error_log('app_sync_meta ensure: ' . $e->getMessage());
  }
}

/**
 * If aws_sync_session_nudge is true in secrets, marks sync as due when last success is older than the interval.
 * Actual AWS pull must run in a separate cron/worker — see product-plan/aws-mysql-sync-plan.md.
 */
function syncRequestPullFromAwsIfStale(PDO $db): void {
  $secrets = getSecrets();
  if (empty($secrets['aws_sync_session_nudge'])) {
    return;
  }
  $interval = isset($secrets['aws_sync_min_interval_seconds'])
    ? max(300, (int) $secrets['aws_sync_min_interval_seconds'])
    : 3600;
  try {
    syncMetaEnsureTable($db);
    $db->prepare(
      'UPDATE app_sync_meta SET pending_after_session_at = NOW()
       WHERE id = 1
         AND (
           last_successful_pull_at IS NULL
           OR last_successful_pull_at < DATE_SUB(NOW(), INTERVAL ? SECOND)
         )'
    )->execute([$interval]);
  } catch (Throwable $e) {
    error_log('aws sync nudge: ' . $e->getMessage());
  }
}

function jsonOut(array $data, int $status = 200): never {
  http_response_code($status);
  header('Content-Type: application/json');
  echo json_encode($data);
  exit;
}
