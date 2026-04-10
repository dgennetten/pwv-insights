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

jsonOut([
  'success'   => true,
  'token'     => $token,
  'email'     => $email,
  'name'      => trim($row['FirstName'] . ' ' . $row['LastName']),
  'role'      => $role,
  'personId'  => (int)$row['person_id'],
  'expiresAt' => $expiresTs * 1000,
]);
