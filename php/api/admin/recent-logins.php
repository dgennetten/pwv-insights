<?php
/**
 * Recent successful logins (auth_login_log). Admin session token required.
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

$body  = json_decode(file_get_contents('php://input'), true) ?? [];
$token = trim($body['token'] ?? '');

if ($token === '' || strlen($token) !== 64 || !ctype_xdigit($token)) {
  jsonOut(['success' => false, 'error' => 'Invalid token'], 401);
}

$db = getDb();

$stmt = $db->prepare(
  'SELECT s.person_id, s.expires_at, m.EmailAddress
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
  jsonOut(['success' => false, 'error' => 'Session expired'], 401);
}

$email = strtolower(trim($row['EmailAddress']));
if ($email !== strtolower(ADMIN_EMAIL)) {
  jsonOut(['success' => false, 'error' => 'Forbidden'], 403);
}

try {
  $q = $db->query(
    'SELECT l.person_id AS memberId, m.LastName AS lastName, m.FirstName AS firstName,
            UNIX_TIMESTAMP(l.logged_in_at) * 1000 AS loggedInAtMs
     FROM auth_login_log l
     INNER JOIN t_member m ON m.PersonID = l.person_id
     ORDER BY l.logged_in_at DESC, l.id DESC
     LIMIT 500'
  );
  $rows = $q->fetchAll(PDO::FETCH_ASSOC);
} catch (Throwable $e) {
  error_log('admin/recent-logins: ' . $e->getMessage());
  jsonOut([
    'success' => false,
    'error'   => 'Could not load login history',
    'hint'    => 'Ensure auth_login_log exists (run sql/03-auth-login-log.sql).',
  ], 500);
}

$logins = [];
foreach ($rows as $r) {
  $logins[] = [
    'memberId'     => (int) $r['memberId'],
    'lastName'     => (string) $r['lastName'],
    'firstName'    => (string) $r['firstName'],
    'loggedInAtMs' => (int) $r['loggedInAtMs'],
  ];
}

jsonOut(['success' => true, 'logins' => $logins]);
