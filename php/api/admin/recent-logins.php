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

authLoginLogEnsureTable($db);

try {
  $q = $db->query(
    "SELECT l.person_id AS memberId, m.LastName AS lastName, m.FirstName AS firstName,
            UNIX_TIMESTAMP(l.logged_in_at) * 1000 AS loggedInAtMs,
            COALESCE(l.login_type, 'OTC') AS loginType
     FROM auth_login_log l
     INNER JOIN t_member m ON m.PersonID = l.person_id
     ORDER BY l.logged_in_at DESC, l.id DESC
     LIMIT 500"
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
  $type = in_array($r['loginType'], ['ACCESS', 'AUTO'], true) ? $r['loginType'] : 'OTC';
  $logins[] = [
    'memberId'     => (int) $r['memberId'],
    'lastName'     => (string) $r['lastName'],
    'firstName'    => (string) $r['firstName'],
    'loggedInAtMs' => (int) $r['loggedInAtMs'],
    'loginType'    => $type,
  ];
}

// Trial guests have no t_member row, so they never hit auth_login_log — surface each
// activated trial link (with its most recent open time) as a TRIAL row instead.
try {
  trialLinksEnsureTable($db);
  $trialRows = $db->query(
    "SELECT label, use_count,
            UNIX_TIMESTAMP(COALESCE(last_used_at, activated_at)) * 1000 AS loggedInAtMs
     FROM trial_links
     WHERE activated_at IS NOT NULL
     ORDER BY COALESCE(last_used_at, activated_at) DESC
     LIMIT 500"
  )->fetchAll(PDO::FETCH_ASSOC);
  foreach ($trialRows as $r) {
    $label = trim((string) ($r['label'] ?? ''));
    $logins[] = [
      'memberId'     => 0,
      'lastName'     => '',
      'firstName'    => $label !== '' ? ('Trial · ' . $label) : 'Trial Guest',
      'loggedInAtMs' => (int) $r['loggedInAtMs'],
      'loginType'    => 'TRIAL',
    ];
  }
} catch (Throwable $e) {
  error_log('admin/recent-logins trial merge: ' . $e->getMessage());
}

// Merge member + trial events, newest first, capped.
usort($logins, static fn($a, $b) => $b['loggedInAtMs'] <=> $a['loggedInAtMs']);
$logins = array_slice($logins, 0, 500);

jsonOut(['success' => true, 'logins' => $logins]);
