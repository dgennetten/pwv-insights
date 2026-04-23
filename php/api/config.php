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

/**
 * Ensures user_preferences exists (matches sql/07-user-preferences.sql). Idempotent.
 */
function userPrefsEnsureTable(PDO $db): void {
  try {
    $db->exec(
      'CREATE TABLE IF NOT EXISTS user_preferences (
        person_id   INT UNSIGNED NOT NULL PRIMARY KEY,
        prefs       JSON         NOT NULL,
        updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_user_prefs_person
          FOREIGN KEY (person_id) REFERENCES t_member(PersonID) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
  } catch (Throwable $e) {
    error_log('user_preferences ensure table: ' . $e->getMessage());
  }
}

/**
 * When the same email appears in t_member more than once (e.g. after an AWS sync that inserts
 * rather than updates), return the PersonID that has the most patrol activity in t_report_member.
 * Falls back to the highest PersonID as a tiebreaker so the result is always deterministic.
 *
 * Auth callers (verify-otp, session refresh, dev-auto-login) use this instead of a bare
 * LIMIT 1 so that "Me" on the dashboard resolves to the same PersonID as the members list.
 */
function resolvePreferredPersonId(PDO $db, string $emailLower): ?int {
  $stmt = $db->prepare(
    'SELECT m.PersonID
     FROM t_member m
     WHERE LOWER(m.EmailAddress) = ?
     ORDER BY (SELECT COUNT(*) FROM t_report_member rm WHERE rm.PersonID = m.PersonID) DESC,
              m.PersonID DESC
     LIMIT 1'
  );
  $stmt->execute([$emailLower]);
  $row = $stmt->fetchColumn();
  return $row !== false ? (int)$row : null;
}

function sendOtpMail(string $to, string $subject, string $body): void {
  $secrets = getSecrets();
  $smtp    = $secrets['smtp']          ?? null;
  $srcDir  = $secrets['phpmailer_src'] ?? '';
  $t0      = microtime(true);

  // Write to ~/otp.log (two levels above php/api/ — home dir, not web-accessible).
  // Falls back to error_log() if the file is not writable.
  $logFile = dirname(dirname(__DIR__)) . '/otp.log';
  $otpLog  = static function (string $line) use ($logFile): void {
    $entry = date('[Y-m-d H:i:s T]') . ' ' . $line . PHP_EOL;
    if (@file_put_contents($logFile, $entry, FILE_APPEND | LOCK_EX) === false) {
      error_log($line);
    }
  };

  if ($srcDir && is_array($smtp) && !empty($smtp['username'])) {
    if (!file_exists($srcDir . '/PHPMailer.php')) {
      $otpLog('[OTP-SEND] FAIL to=' . $to . ' reason=PHPMailer not found at ' . $srcDir);
      return;
    }
    require_once $srcDir . '/Exception.php';
    require_once $srcDir . '/PHPMailer.php';
    require_once $srcDir . '/SMTP.php';

    $mail = new PHPMailer\PHPMailer\PHPMailer(true);
    try {
      // Set smtp.debug: 1-4 in config.secret.php to capture SMTP conversation.
      // 1 = client commands only, 2 = client+server (recommended for diagnosis).
      $debugLevel = (int) ($smtp['debug'] ?? 0);
      if ($debugLevel > 0) {
        $mail->SMTPDebug   = $debugLevel;
        $mail->Debugoutput = static function (string $str, int $level) use ($to, $otpLog): void {
          $otpLog('[OTP-SMTP-DEBUG:' . $level . '] to=' . $to . ' ' . rtrim($str));
        };
      }

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

      $ms = round((microtime(true) - $t0) * 1000);
      $otpLog('[OTP-SEND] OK to=' . $to . ' msg-id=' . $mail->MessageID . ' elapsed=' . $ms . 'ms');
    } catch (PHPMailer\PHPMailer\Exception $e) {
      $ms = round((microtime(true) - $t0) * 1000);
      $otpLog('[OTP-SEND] FAIL to=' . $to . ' elapsed=' . $ms . 'ms'
        . ' error=' . $e->getMessage()
        . ' detail=' . $mail->ErrorInfo);
    }
  } else {
    $headers = 'From: ' . MAIL_FROM_NAME . ' <' . MAIL_FROM . ">\r\n"
             . "Content-Type: text/plain; charset=UTF-8\r\n";
    $result = mail($to, $subject, $body, $headers);
    $ms     = round((microtime(true) - $t0) * 1000);
    $otpLog('[OTP-SEND] ' . ($result ? 'OK' : 'FAIL') . ' to=' . $to . ' via mail() elapsed=' . $ms . 'ms');
  }
}

function jsonOut(array $data, int $status = 200): never {
  http_response_code($status);
  header('Content-Type: application/json');
  echo json_encode($data);
  exit;
}
