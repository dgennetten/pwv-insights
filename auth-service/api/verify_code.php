<?php
require_once __DIR__ . '/config.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { jsonOut(['error' => 'Method not allowed'], 405); }

$body      = json_decode(file_get_contents('php://input'), true) ?? [];
$appId     = trim($body['app_id']     ?? '');
$appSecret = trim($body['app_secret'] ?? '');
$email     = trim($body['email']      ?? '');
$code      = trim($body['code']       ?? '');

if (!$appId || !$appSecret || !filter_var($email, FILTER_VALIDATE_EMAIL) || !preg_match('/^\d{6}$/', $code)) {
  jsonOut(['success' => false]);
}

if (!verifyApp($appId, $appSecret)) {
  jsonOut(['success' => false]);
}

$db = authDb();

// Find a valid, unused, unexpired code
$stmt = $db->prepare(
  'SELECT id FROM otp_codes
   WHERE app_id = ? AND email = ? AND code = ? AND used = 0 AND expires_at > NOW()
   LIMIT 1'
);
$stmt->execute([$appId, $email, $code]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$row) {
  jsonOut(['success' => false]);
}

// Mark the code used
$db->prepare('UPDATE otp_codes SET used = 1 WHERE id = ?')->execute([$row['id']]);

// Clean up old expired codes periodically (1-in-20 chance to avoid doing it every request)
if (random_int(1, 20) === 1) {
  $db->prepare('DELETE FROM otp_codes WHERE expires_at < NOW() OR used = 1')->execute();
}

jsonOut(['success' => true]);
