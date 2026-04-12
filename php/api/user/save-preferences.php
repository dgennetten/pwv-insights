<?php
/**
 * Upserts preferences for the current session user.
 * Only known keys are accepted; unknown keys are stripped.
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

// Validate and sanitize — only known boolean fields accepted.
$raw = $body['prefs'] ?? [];
if (!is_array($raw)) {
  jsonOut(['success' => false, 'error' => 'Invalid prefs payload'], 400);
}

$bool = fn($v) => (bool) $v;

$dashKpiRaw = $raw['dashboardKpi'] ?? [];
$trailRaw   = $raw['trailDetail']  ?? [];

$prefs = [
  'dashboardKpi' => [
    'patrols'         => $bool($dashKpiRaw['patrols']         ?? true),
    'trailsCovered'   => $bool($dashKpiRaw['trailsCovered']   ?? true),
    'treesCleared'    => $bool($dashKpiRaw['treesCleared']    ?? true),
    'hikersSeen'      => $bool($dashKpiRaw['hikersSeen']      ?? true),
    'daysPatrolling'  => $bool($dashKpiRaw['daysPatrolling']  ?? false),
    'daysWeeding'     => $bool($dashKpiRaw['daysWeeding']     ?? false),
    'hikersContacted' => $bool($dashKpiRaw['hikersContacted'] ?? true),
  ],
  'trailDetail' => [
    'treesCleared'    => $bool($trailRaw['treesCleared']    ?? true),
    'hikersSeen'      => $bool($trailRaw['hikersSeen']      ?? true),
    'hikersContacted' => $bool($trailRaw['hikersContacted'] ?? true),
  ],
];

userPrefsEnsureTable($db);

try {
  $stmt = $db->prepare(
    'INSERT INTO user_preferences (person_id, prefs)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE prefs = VALUES(prefs)'
  );
  $stmt->execute([$personId, json_encode($prefs)]);
} catch (Throwable $e) {
  error_log('save-preferences person_id=' . $personId . ': ' . $e->getMessage());
  jsonOut(['success' => false, 'error' => 'Failed to save preferences'], 500);
}

jsonOut(['success' => true]);
