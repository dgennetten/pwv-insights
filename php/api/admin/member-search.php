<?php
/**
 * Search members by name (admin only). Returns PersonID and BirthDate for auth-link generation.
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
$query = trim($body['query'] ?? '');

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

if (strlen($query) < 2) {
  jsonOut(['success' => true, 'members' => []]);
}

$like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $query) . '%';

try {
  $stmt = $db->prepare(
    "SELECT PersonID, FirstName, LastName,
            DATE_FORMAT(BirthDate, '%Y%m%d') AS dob
     FROM t_member
     WHERE (FirstName LIKE ? OR LastName LIKE ?
            OR CONCAT(FirstName, ' ', LastName) LIKE ?
            OR CONCAT(LastName, ', ', FirstName) LIKE ?
            OR EmailAddress LIKE ?)
       AND BirthDate IS NOT NULL
     ORDER BY LastName, FirstName
     LIMIT 20"
  );
  $stmt->execute([$like, $like, $like, $like, $like]);
  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
} catch (Throwable $e) {
  error_log('admin/member-search: ' . $e->getMessage());
  jsonOut(['success' => false, 'error' => 'Search failed'], 500);
}

$members = [];
foreach ($rows as $r) {
  if (!$r['dob'] || strlen($r['dob']) !== 8) continue;
  $members[] = [
    'memberId'  => (int) $r['PersonID'],
    'firstName' => (string) $r['FirstName'],
    'lastName'  => (string) $r['LastName'],
    'dob'       => (string) $r['dob'],
  ];
}

jsonOut(['success' => true, 'members' => $members]);
