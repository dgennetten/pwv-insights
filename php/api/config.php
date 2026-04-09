<?php
define('DB_HOST', 'mysql.gennetten.com');
define('DB_NAME', 'pwvinsights');

$secrets = include __DIR__ . '/config.secret.php';
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

function jsonOut(array $data, int $status = 200): never {
  http_response_code($status);
  header('Content-Type: application/json');
  echo json_encode($data);
  exit;
}
