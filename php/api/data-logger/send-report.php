<?php
require_once __DIR__ . '/../config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  jsonOut(['success' => false, 'error' => 'Method not allowed'], 405);
}

$body             = json_decode(file_get_contents('php://input'), true) ?? [];
$token            = trim($body['token']      ?? '');
$entries          = is_array($body['entries'] ?? null) ? $body['entries'] : [];
$memberName       = trim($body['memberName'] ?? '');
$reportDate       = trim($body['reportDate'] ?? date('Y-m-d'));
$includeLocations = !empty($body['includeLocations']);

if ($token === '' || strlen($token) !== 64 || !ctype_xdigit($token)) {
  jsonOut(['success' => false, 'error' => 'Invalid token'], 401);
}

$db   = getDb();
$stmt = $db->prepare(
  'SELECT s.person_id, s.expires_at, m.EmailAddress, m.FirstName, m.LastName
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
if (strtotime($row['expires_at']) < time()) {
  jsonOut(['success' => false, 'error' => 'Session expired'], 401);
}

$memberEmail = strtolower(trim($row['EmailAddress']));
if ($memberName === '') {
  $memberName = trim($row['FirstName'] . ' ' . $row['LastName']);
}

// ── Tally entries ─────────────────────────────────────────────────
$hikerSeen      = 0;
$hikerContacted = 0;
$trees = [
  'cleared' => ['small' => 0, 'medium' => 0, 'large' => 0, 'xl' => 0],
  'noted'   => ['small' => 0, 'medium' => 0, 'large' => 0, 'xl' => 0],
];
$sessionStart = null;
$detailRows   = [];  // chronological list for the detail section

$fmtCoords = function (?float $lat, ?float $lng): string {
  if ($lat === null || $lng === null) return 'GPS unavailable    ';
  $ns = $lat >= 0 ? 'N' : 'S';
  $ew = $lng >= 0 ? 'E' : 'W';
  return number_format(abs($lat), 4) . "°{$ns} " . number_format(abs($lng), 4) . "°{$ew}";
};

foreach ($entries as $e) {
  if (!is_array($e)) continue;
  $type = (string) ($e['type'] ?? '');
  $ts   = isset($e['timestamp']) ? (int) $e['timestamp'] : null;
  $lat  = isset($e['lat']) && $e['lat'] !== null ? (float) $e['lat'] : null;
  $lng  = isset($e['lng']) && $e['lng'] !== null ? (float) $e['lng'] : null;

  if ($sessionStart === null || ($ts !== null && $ts < $sessionStart)) {
    $sessionStart = $ts;
  }

  $time   = $ts ? date('g:i A', intdiv($ts, 1000)) : '--:--';
  $coords = $fmtCoords($lat, $lng);

  if ($type === 'hiker') {
    $sub = (string) ($e['hikerSubtype'] ?? '');
    if ($sub === 'seen') $hikerSeen++;
    elseif ($sub === 'contacted') $hikerContacted++;
    $label        = 'Hiker — ' . ucfirst($sub);
    $detailRows[] = ['ts' => $ts ?? 0, 'subtype' => $sub, 'line' => "  [{$time} | {$coords}] {$label}"];

  } elseif ($type === 'tree') {
    $sub  = (string) ($e['treeSubtype'] ?? '');
    $size = (string) ($e['treeSize']    ?? '');
    if (isset($trees[$sub][$size])) $trees[$sub][$size]++;
    $sizeLabel    = ['small' => 'Small (<8")', 'medium' => 'Medium (8–15")', 'large' => 'Large (16–23")', 'xl' => 'XL (24–36")'][$size] ?? $size;
    $label        = 'Tree — ' . ucfirst($sub) . ', ' . $sizeLabel;
    $detailRows[] = ['ts' => $ts ?? 0, 'subtype' => $sub, 'line' => "  [{$time} | {$coords}] {$label}"];

  } elseif ($type === 'note') {
    $text = trim((string) ($e['noteText'] ?? ''));
    if ($text === '') continue;
    $detailRows[] = ['ts' => $ts ?? 0, 'subtype' => 'note', 'line' => "  [{$time} | {$coords}] Note: {$text}"];
  }
}

// Sort detail rows chronologically
usort($detailRows, fn($a, $b) => $a['ts'] <=> $b['ts']);

// Remove the auto-generated 'seen' entries that were paired with a 'contacted' tap
// (they share the exact same timestamp). Keep only the 'contacted' line for those.
$contactedTs = [];
foreach ($detailRows as $row) {
  if ($row['subtype'] === 'contacted') $contactedTs[$row['ts']] = true;
}
$detailRows = array_values(array_filter(
  $detailRows,
  fn($row) => !($row['subtype'] === 'seen' && isset($contactedTs[$row['ts']]))
));

// ── Format report ─────────────────────────────────────────────────
$sizeLabels = [
  'small'  => 'Small (<8")',
  'medium' => 'Medium (8–15")',
  'large'  => 'Large (16–23")',
  'xl'     => 'XL (24–36")',
];

$fmtRow = function (array $row) use ($sizeLabels): string {
  $parts = [];
  foreach ($sizeLabels as $key => $label) {
    $parts[] = "{$label}: {$row[$key]}";
  }
  return implode('  |  ', $parts);
};

$hikerTotal = $hikerSeen;  // seen already includes auto-increments from contacted taps
$startTime  = $sessionStart ? date('g:i A', intdiv($sessionStart, 1000)) : '—';
$sentTime   = date('g:i A');

$div  = str_repeat('═', 45);
$divs = str_repeat('─', 45);

$lines = [
  'PWV Trail Patrol — Data Logger Report',
  "Member:  {$memberName}",
  "Date:    {$reportDate}",
  '',
  $div,
  'SUMMARY',
  '',
  'HIKERS ENCOUNTERED',
  "  Seen:       {$hikerSeen}",
  "  Contacted:  {$hikerContacted}",
  "  Total:      {$hikerTotal}",
  '',
  'TREES LOGGED',
  '  Cleared:  ' . $fmtRow($trees['cleared']),
  '  Noted:    ' . $fmtRow($trees['noted']),
];

if ($includeLocations && !empty($detailRows)) {
  $lines[] = '';
  $lines[] = $div;
  $lines[] = 'DETAILED LOG';
  foreach ($detailRows as $row) {
    $lines[] = $row['line'];
  }
}

$lines[] = '';
$lines[] = $divs;
$lines[] = "Session started: {$startTime}";
$lines[] = "Report sent:     {$sentTime}";

$reportBody = implode("\n", $lines);
$subject    = "PWV Data Logger Report — {$reportDate}";

sendOtpMail($memberEmail, $subject, $reportBody);

jsonOut(['success' => true]);
