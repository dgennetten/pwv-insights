<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/trail-log-utils.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$body  = json_decode(file_get_contents('php://input'), true) ?? [];
$token = trim($body['token'] ?? '');

if ($token === '' || strlen($token) !== 64 || !ctype_xdigit($token)) {
  jsonOut(['success' => false, 'error' => 'Invalid token'], 401);
}

$db   = getDb();
$stmt = $db->prepare(
  'SELECT s.person_id, s.expires_at, m.EmailAddress
   FROM auth_sessions s
   JOIN t_member m ON m.PersonID = s.person_id
   WHERE s.token = ? LIMIT 1'
);
$stmt->execute([$token]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$row || strtotime($row['expires_at']) < time()) {
  jsonOut(['success' => false, 'error' => 'Session invalid or expired'], 401);
}

if (strtolower(trim($row['EmailAddress'])) !== strtolower(ADMIN_EMAIL)) {
  jsonOut(['success' => false, 'error' => 'Forbidden'], 403);
}

$dataLoggerDir = dirname(dirname(dirname(__DIR__))) . '/data-logger';

if (!is_dir($dataLoggerDir)) {
  jsonOut(['success' => true, 'logs' => []]);
}

$logs = [];

foreach (glob($dataLoggerDir . '/trailLog.*.json') as $filePath) {
  $filename = pathinfo($filePath, PATHINFO_FILENAME); // trailLog.4811202605271251

  if (!preg_match('/^trailLog\.(\d+)$/', $filename, $m)) continue;
  $inner = $m[1]; // e.g. 4811202605271251

  if (strlen($inner) < 13) continue; // need at least 1 personId digit + 12 date/time digits

  $dateTime = substr($inner, -12); // YmdHi = 202605271251

  $dateStr = substr($dateTime, 0, 8); // 20260527
  $timeStr = substr($dateTime, 8, 4); // 1251

  $dt = DateTime::createFromFormat('Ymd', $dateStr);
  $tm = DateTime::createFromFormat('Hi',  $timeStr);

  $json = null;
  $memberName = '';
  $raw = @file_get_contents($filePath);
  if ($raw !== false) {
    $decoded = json_decode($raw, true);
    if (is_array($decoded)) {
      $json = $decoded;
      $memberName = (string) ($json['member'] ?? '');
    }
  }

  $logId = is_array($json) && !empty($json['logId'])
    ? (string) $json['logId']
    : $filename;
  $memberId = trailLogResolvePersonId($db, is_array($json) ? $json : [], $logId);

  $logs[] = [
    'logId'      => $logId,
    'memberId'   => $memberId,
    'memberName' => $memberName,
    'date'       => $dt ? $dt->format('M j, Y') : $dateStr,
    'time'       => $tm ? $tm->format('g:i A')  : $timeStr,
    'sortKey'    => $dateTime,
  ];
}

usort($logs, fn($a, $b) => strcmp($b['sortKey'], $a['sortKey']));

jsonOut(['success' => true, 'logs' => $logs]);
