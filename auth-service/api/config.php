<?php
// Auth service configuration — lives on auth.gennetten.org
// Load secrets from outside version control in production.

define('DB_HOST', 'mysql.gennetten.com');
define('DB_NAME', 'gennetten_auth');

// Fill these in on the server (or load from a secrets file)
define('DB_USER', 'YOUR_DB_USER');
define('DB_PASS', 'YOUR_DB_PASS');

// Email "from" address for OTP emails
define('MAIL_FROM',    'noreply@gennetten.org');
define('MAIL_FROM_NAME', 'Gennetten Auth');

// OTP expires after this many minutes
define('OTP_TTL_MINUTES', 10);

function authDb(): PDO {
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
 * Validate app credentials. Returns the app row or false.
 */
function verifyApp(string $appId, string $appSecret): bool {
  $db   = authDb();
  $stmt = $db->prepare(
    'SELECT id FROM apps WHERE app_id = ? AND app_secret = SHA2(?, 256) AND is_active = 1 LIMIT 1'
  );
  $stmt->execute([$appId, $appSecret]);
  return (bool) $stmt->fetch();
}

function jsonOut(array $data, int $status = 200): never {
  http_response_code($status);
  header('Content-Type: application/json');
  echo json_encode($data);
  exit;
}
