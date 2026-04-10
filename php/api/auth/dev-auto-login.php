<?php
/**
 * Local development only: issue a session without OTP.
 * Allowed when the request appears to come from this machine (loopback).
 */
require_once __DIR__ . '/../config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  jsonOut(['success' => false, 'error' => 'Method not allowed'], 405);
}

function devAutoLoginAllowed(): bool {
  $ip = $_SERVER['REMOTE_ADDR'] ?? '';
  if ($ip === '127.0.0.1' || $ip === '::1') {
    return true;
  }
  $host = strtolower($_SERVER['HTTP_HOST'] ?? '');
  return str_starts_with($host, 'localhost') || str_starts_with($host, '127.0.0.1');
}

if (!devAutoLoginAllowed()) {
  jsonOut(['success' => false, 'error' => 'Forbidden'], 403);
}

$email = 'douglas@gennetten.com';

$db = getDb();
$stmt = $db->prepare(
  'SELECT PersonID, FirstName, LastName FROM t_member
   WHERE LOWER(EmailAddress) = ? LIMIT 1'
);
$stmt->execute([$email]);
$member = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$member) {
  jsonOut(['success' => false, 'error' => 'Member not found'], 404);
}

$token     = bin2hex(random_bytes(32));
$expiresAt = date('Y-m-d H:i:s', strtotime('+365 days'));
$db->prepare('INSERT INTO auth_sessions (person_id, token, expires_at) VALUES (?, ?, ?)')
  ->execute([$member['PersonID'], $token, $expiresAt]);

$role = (strtolower($email) === strtolower(ADMIN_EMAIL)) ? 'admin' : 'member';

$expiresTs = strtotime($expiresAt);
if ($expiresTs === false) {
  $expiresTs = time() + 365 * 86400;
}

jsonOut([
  'success'   => true,
  'token'     => $token,
  'email'     => $email,
  'name'      => trim($member['FirstName'] . ' ' . $member['LastName']),
  'role'      => $role,
  'personId'  => (int)$member['PersonID'],
  'expiresAt' => $expiresTs * 1000,
]);
