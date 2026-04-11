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
 * Safe to call on every successful login; CREATE is skipped once the table exists.
 */
function authLoginLogEnsureTable(PDO $db): void {
  static $ensured = false;
  if ($ensured) {
    return;
  }
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
    $ensured = true;
  } catch (Throwable $e) {
    error_log('auth_login_log ensure table: ' . $e->getMessage());
  }
}

function jsonOut(array $data, int $status = 200): never {
  http_response_code($status);
  header('Content-Type: application/json');
  echo json_encode($data);
  exit;
}
