<?php
/**
 * Search members by name — any signed-in PWV member.
 * POST body: { token, query }
 */
require_once __DIR__ . '/../config.php';

define('MS_PWV_GROUP', 10);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
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
  'SELECT s.expires_at FROM auth_sessions s WHERE s.token = ? LIMIT 1'
);
$stmt->execute([$token]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$row) jsonOut(['success' => false, 'error' => 'Unknown session'], 401);
$exp = strtotime($row['expires_at']);
if ($exp === false || $exp < time()) jsonOut(['success' => false, 'error' => 'Session expired'], 401);

if (strlen($query) < 2) {
  jsonOut(['success' => true, 'members' => []]);
}

$like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $query) . '%';

try {
  $stmt = $db->prepare(
    "SELECT m.PersonID, m.FirstName, m.LastName
     FROM t_member m
     JOIN t_mem_group mg ON mg.PersonID = m.PersonID AND mg.GroupID = ?
     WHERE (m.FirstName LIKE ? OR m.LastName LIKE ?
            OR CONCAT(m.FirstName, ' ', m.LastName) LIKE ?
            OR CONCAT(m.LastName, ', ', m.FirstName) LIKE ?
            OR m.EmailAddress LIKE ?)
     ORDER BY m.LastName, m.FirstName
     LIMIT 20"
  );
  $stmt->execute([MS_PWV_GROUP, $like, $like, $like, $like, $like]);
  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
} catch (Throwable $e) {
  error_log('user/member-search: ' . $e->getMessage());
  jsonOut(['success' => false, 'error' => 'Search failed'], 500);
}

$members = [];
foreach ($rows as $r) {
  $members[] = [
    'memberId'  => (int) $r['PersonID'],
    'firstName' => (string) $r['FirstName'],
    'lastName'  => (string) $r['LastName'],
  ];
}

jsonOut(['success' => true, 'members' => $members]);
