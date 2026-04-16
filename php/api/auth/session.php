<?php
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

$body  = json_decode(file_get_contents('php://input'), true) ?? [];
$token = trim($body['token'] ?? '');

if ($token === '' || strlen($token) !== 64 || !ctype_xdigit($token)) {
  jsonOut(['success' => false, 'error' => 'Invalid token'], 401);
}

$db = getDb();

$stmt = $db->prepare(
  'SELECT s.person_id, s.expires_at, m.FirstName, m.LastName, m.EmailAddress
   FROM auth_sessions s
   JOIN t_member m ON m.PersonID = s.person_id
   WHERE s.token = ?
   LIMIT 1'
);
$stmt->execute([$token]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$row) {
  jsonOut(['success' => false, 'error' => 'Unknown session'], 401);
}

$expiresTs = strtotime($row['expires_at']);
if ($expiresTs === false || $expiresTs < time()) {
  $db->prepare('DELETE FROM auth_sessions WHERE token = ?')->execute([$token]);
  jsonOut(['success' => false, 'error' => 'Session expired'], 401);
}

$email = strtolower(trim($row['EmailAddress']));
$role  = (strtolower($email) === strtolower(ADMIN_EMAIL)) ? 'admin' : 'member';

// Re-resolve the preferred PersonID in case the AWS sync created a newer t_member record
// for this email after the original session was issued.  If the preferred ID differs from
// the stored one and the t_member row exists, update the session and return the new ID so
// "Me" on the dashboard matches the same PersonID as the "Other member" members list.
$sessionPersonId = (int) $row['person_id'];
$preferredId     = resolvePreferredPersonId($db, $email) ?? $sessionPersonId;
if ($preferredId !== $sessionPersonId) {
  try {
    $db->prepare('UPDATE auth_sessions SET person_id = ? WHERE token = ?')->execute([$preferredId, $token]);
    $sessionPersonId = $preferredId;
  } catch (Throwable $e) {
    error_log('session.php personId refresh: ' . $e->getMessage());
    // Non-fatal: continue with the original person_id
  }
}

// Remember-this-device restores hit session.php, not verify-otp.php — log those too.
authLoginLogRecord($db, $sessionPersonId);
memberLastLoginTouch($db, $sessionPersonId);
syncRequestPullFromAwsIfStale($db);

// Also fetch name/email from the preferred member record if it changed
$name = trim($row['FirstName'] . ' ' . $row['LastName']);
if ($preferredId !== (int) $row['person_id']) {
  $nameStmt = $db->prepare('SELECT FirstName, LastName FROM t_member WHERE PersonID = ? LIMIT 1');
  $nameStmt->execute([$preferredId]);
  $nameRow = $nameStmt->fetch(PDO::FETCH_ASSOC);
  if ($nameRow) {
    $name = trim($nameRow['FirstName'] . ' ' . $nameRow['LastName']);
  }
}

jsonOut([
  'success'   => true,
  'token'     => $token,
  'email'     => $email,
  'name'      => $name,
  'role'      => $role,
  'personId'  => $sessionPersonId,
  'expiresAt' => $expiresTs * 1000,
]);
