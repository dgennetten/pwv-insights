<?php
/**
 * Returns the stored preferences for the current session user.
 * Missing keys are filled in with defaults client-side.
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
  'SELECT s.person_id, s.expires_at
   FROM auth_sessions s
   WHERE s.token = ?
   LIMIT 1'
);
$stmt->execute([$token]);
$session = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$session) {
  jsonOut(['success' => false, 'error' => 'Unknown session'], 401);
}

$expiresTs = strtotime($session['expires_at']);
if ($expiresTs === false || $expiresTs < time()) {
  jsonOut(['success' => false, 'error' => 'Session expired'], 401);
}

$personId = (int) $session['person_id'];

userPrefsEnsureTable($db);

$stmt = $db->prepare('SELECT prefs FROM user_preferences WHERE person_id = ? LIMIT 1');
$stmt->execute([$personId]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

$prefs = $row ? json_decode($row['prefs'], true) : null;

jsonOut(['success' => true, 'prefs' => $prefs ?? new stdClass()]);
