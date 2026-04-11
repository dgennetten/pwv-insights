<?php
require_once __DIR__ . '/../config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$body  = json_decode(file_get_contents('php://input'), true) ?? [];
$email = strtolower(trim($body['email'] ?? ''));
$code  = trim($body['code'] ?? '');

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !preg_match('/^\d{6}$/', $code)) {
  jsonOut(['success' => false, 'error' => 'Invalid input']);
}

$db = getDb();

// Find a valid, unused, unexpired code
$stmt = $db->prepare(
  'SELECT id FROM otp_codes
   WHERE email = ? AND code = ? AND used = 0 AND expires_at > NOW()
   LIMIT 1'
);
$stmt->execute([$email, $code]);
$otpRow = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$otpRow) {
  jsonOut(['success' => false, 'error' => 'Invalid or expired code']);
}

// Mark code as used
$db->prepare('UPDATE otp_codes SET used = 1 WHERE id = ?')->execute([$otpRow['id']]);

// Look up member
$stmt = $db->prepare(
  'SELECT PersonID, FirstName, LastName FROM t_member
   WHERE LOWER(EmailAddress) = ? LIMIT 1'
);
$stmt->execute([$email]);
$member = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$member) {
  jsonOut(['success' => false, 'error' => 'Member not found']);
}

// Create session token — long-lived if "remember this device" was checked
$remember  = !empty($body['remember']);
$token     = bin2hex(random_bytes(32));
$expiresAt = date('Y-m-d H:i:s', strtotime($remember ? '+365 days' : '+1 day'));
$db->prepare('INSERT INTO auth_sessions (person_id, token, expires_at) VALUES (?, ?, ?)')
   ->execute([$member['PersonID'], $token, $expiresAt]);

try {
  $db->prepare('INSERT INTO auth_login_log (person_id) VALUES (?)')
    ->execute([(int) $member['PersonID']]);
} catch (Throwable $e) {
  error_log('auth_login_log insert: ' . $e->getMessage());
}

// Occasional cleanup of expired / used OTP codes
if (random_int(1, 20) === 1) {
  $db->prepare('DELETE FROM otp_codes WHERE expires_at < NOW() OR used = 1')->execute();
}

$role = (strtolower($email) === strtolower(ADMIN_EMAIL)) ? 'admin' : 'member';

$expiresTs = strtotime($expiresAt);
if ($expiresTs === false) {
  $expiresTs = time() + ($remember ? 365 * 86400 : 86400);
}

jsonOut([
  'success'   => true,
  'token'     => $token,
  'email'     => $email,
  'name'      => trim($member['FirstName'] . ' ' . $member['LastName']),
  'role'      => $role,
  'personId'  => (int) $member['PersonID'],
  'expiresAt' => $expiresTs * 1000,
]);
