<?php
// Auth service configuration — lives on auth.gennetten.org
// Load secrets from outside version control in production.

define('DB_HOST', 'mysql.gennetten.com');
define('DB_NAME', 'gennetten_auth');

function getSecrets(): array {
  static $cache = null;
  if ($cache === null) {
    $path  = __DIR__ . '/config.secret.php';
    $cache = file_exists($path) ? (include $path) : [];
  }
  return $cache;
}

$_s = getSecrets();
// Fill these in via config.secret.php or directly below
define('DB_USER', $_s['db_user'] ?? 'YOUR_DB_USER');
define('DB_PASS', $_s['db_pass'] ?? 'YOUR_DB_PASS');

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

function sendOtpMail(string $to, string $subject, string $body): void {
  $secrets = getSecrets();
  $smtp    = $secrets['smtp']          ?? null;
  $srcDir  = $secrets['phpmailer_src'] ?? '';

  if ($srcDir && is_array($smtp) && !empty($smtp['username'])) {
    if (!file_exists($srcDir . '/PHPMailer.php')) {
      error_log("sendOtpMail: PHPMailer not found at $srcDir");
      return;
    }
    require_once $srcDir . '/Exception.php';
    require_once $srcDir . '/PHPMailer.php';
    require_once $srcDir . '/SMTP.php';

    try {
      $mail = new PHPMailer\PHPMailer\PHPMailer(true);
      $mail->isSMTP();
      $mail->Host       = $smtp['host'];
      $mail->SMTPAuth   = $smtp['auth'] ?? true;
      $mail->Username   = $smtp['username'];
      $mail->Password   = $smtp['password'];
      $mail->SMTPSecure = $smtp['secure'] ?? 'tls';
      $mail->Port       = (int) ($smtp['port'] ?? 587);
      $mail->Timeout    = (int) ($smtp['timeout'] ?? 10);
      $mail->setFrom($smtp['from_email'] ?? MAIL_FROM, $smtp['from_name'] ?? MAIL_FROM_NAME);
      $mail->addAddress($to);
      $mail->Subject = $subject;
      $mail->Body    = $body;
      $mail->isHTML(false);
      $mail->send();
    } catch (PHPMailer\PHPMailer\Exception $e) {
      error_log('sendOtpMail SMTP error: ' . $e->getMessage());
    }
  } else {
    $headers = 'From: ' . MAIL_FROM_NAME . ' <' . MAIL_FROM . ">\r\n"
             . "Content-Type: text/plain; charset=UTF-8\r\n";
    mail($to, $subject, $body, $headers);
  }
}

function jsonOut(array $data, int $status = 200): never {
  http_response_code($status);
  header('Content-Type: application/json');
  echo json_encode($data);
  exit;
}
