<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/trail-log-utils.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  jsonOut(['success' => false, 'error' => 'Method not allowed'], 405);
}

$body             = json_decode(file_get_contents('php://input'), true) ?? [];
$token            = trim($body['token']       ?? '');
$guestEmailRaw    = trim($body['guestEmail']  ?? '');
$entries          = is_array($body['entries'] ?? null) ? $body['entries'] : [];
$memberName       = trim($body['memberName']  ?? '');
$reportDate       = trim($body['reportDate']  ?? date('Y-m-d'));
$includeLocations = !empty($body['includeLocations']);
$trackers         = is_array($body['trackers'] ?? null) ? $body['trackers'] : [];
$trackers         = trailLogNormalizeTrackers($trackers);
$emailFormat      = (string)($body['emailFormat'] ?? 'text');
$isGuest          = ($token === '' && $guestEmailRaw !== '');

if ($isGuest) {
  $memberEmail = strtolower($guestEmailRaw);
  if (!filter_var($memberEmail, FILTER_VALIDATE_EMAIL)) {
    jsonOut(['success' => false, 'error' => 'Invalid email address.'], 400);
  }
  if ($memberName === '') $memberName = 'Guest';
  $personId = 0;
} else {
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
  if ($memberEmail === '' || !filter_var($memberEmail, FILTER_VALIDATE_EMAIL)) {
    jsonOut(['success' => false, 'error' => 'No valid email address on file for this member.'], 400);
  }
  $personId = (int) $row['person_id'];
}

// ── Tally entries ─────────────────────────────────────────────────
$hikerSeen      = 0;
$hikerContacted = 0;
$trees = [
  'cleared' => ['small' => 0, 'medium' => 0, 'large' => 0, 'xl' => 0],
  'noted'   => ['small' => 0, 'medium' => 0, 'large' => 0, 'xl' => 0],
];
$sessionStart   = null;
$detailRows     = [];  // chronological list for the detail section
$summaryNotes   = [];  // time + text only, for the summary block
$violationRows  = [];  // type + note, for the violations summary block

$fmtCoords = function (?float $lat, ?float $lng): string {
  if ($lat === null || $lng === null) return 'GPS unavailable    ';
  $ns = $lat >= 0 ? 'N' : 'S';
  $ew = $lng >= 0 ? 'E' : 'W';
  return number_format(abs($lat), 4) . "{$ns} " . number_format(abs($lng), 4) . "{$ew}";
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
    $label        = 'Hiker - ' . ucfirst($sub);
    $detailRows[] = ['ts' => $ts ?? 0, 'subtype' => $sub, 'line' => "  [{$time} | {$coords}] {$label}"];

  } elseif ($type === 'tree') {
    $sub  = (string) ($e['treeSubtype'] ?? '');
    $size = (string) ($e['treeSize']    ?? '');
    if (isset($trees[$sub][$size])) $trees[$sub][$size]++;
    $sizeLabel    = ['small' => 'Small (<8")', 'medium' => 'Medium (8-15")', 'large' => 'Large (16-23")', 'xl' => 'XL (24-36")'][$size] ?? $size;
    $label        = 'Tree - ' . ucfirst($sub) . ', ' . $sizeLabel;
    $detailRows[] = ['ts' => $ts ?? 0, 'subtype' => $sub, 'line' => "  [{$time} | {$coords}] {$label}"];

  } elseif ($type === 'note') {
    $text = trim((string) ($e['noteText'] ?? ''));
    if ($text === '') continue;
    $summaryNotes[] = ['ts' => $ts ?? 0, 'line' => "  [{$time}] {$text}"];
    $detailRows[]   = ['ts' => $ts ?? 0, 'subtype' => 'note', 'line' => "  [{$time} | {$coords}] Note: {$text}"];

  } elseif ($type === 'violation') {
    $vType = trim((string) ($e['violationType'] ?? ''));
    $vNote = trim((string) ($e['violationNote'] ?? ''));
    $violationRows[] = ['ts' => $ts ?? 0, 'type' => $vType, 'note' => $vNote];
    $label = 'Violation - ' . ($vType ?: 'Unknown');
    if ($vNote !== '') $label .= ': ' . $vNote;
    $detailRows[] = ['ts' => $ts ?? 0, 'subtype' => 'violation', 'line' => "  [{$time} | {$coords}] {$label}"];
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
  'medium' => 'Medium (8-15")',
  'large'  => 'Large (16-23")',
  'xl'     => 'XL (24-36")',
];

$fmtRow = function (array $row) use ($sizeLabels): string {
  $parts = [];
  foreach ($sizeLabels as $key => $label) {
    $parts[] = "{$label}: {$row[$key]}";
  }
  return implode('  |  ', $parts);
};

$hikerTotal = $hikerSeen;  // seen already includes auto-increments from contacted taps
$startTime  = $sessionStart ? date('g:i A', intdiv($sessionStart, 1000)) : 'n/a';
$sentTime   = date('g:i A');

$div = str_repeat('-', 22);

$lines = [
  'PWV Trail Patrol - Data Logger Report',
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

if (!empty($summaryNotes)) {
  usort($summaryNotes, fn($a, $b) => $a['ts'] <=> $b['ts']);
  $lines[] = '';
  $lines[] = 'FIELD NOTES';
  foreach ($summaryNotes as $n) {
    $lines[] = $n['line'];
  }
}

if (!empty($violationRows)) {
  usort($violationRows, fn($a, $b) => $a['ts'] <=> $b['ts']);
  $lines[] = '';
  $lines[] = 'VIOLATIONS (' . count($violationRows) . ')';
  foreach ($violationRows as $vr) {
    $line = '  ' . ($vr['type'] ?: 'Unknown');
    if ($vr['note'] !== '') $line .= ': ' . $vr['note'];
    $lines[] = $line;
  }
}

// ── Distance tracker summary ───────────────────────────────────────
$fmtMi = function (float $m): string {
  return number_format($m / 1609.344, 2) . ' mi';
};
$fmtDur = function (int $ms): string {
  $s = intdiv($ms, 1000);
  $h = intdiv($s, 3600);
  $m = intdiv($s % 3600, 60);
  $sec = $s % 60;
  if ($h > 0) return "{$h}:" . str_pad((string)$m, 2, '0', STR_PAD_LEFT) . ':' . str_pad((string)$sec, 2, '0', STR_PAD_LEFT);
  return "{$m}:" . str_pad((string)$sec, 2, '0', STR_PAD_LEFT);
};
$fmtPt = function (?array $pt): string {
  if (!$pt || !isset($pt['lat'], $pt['lng'])) return 'GPS unavailable';
  $ns = (float)$pt['lat'] >= 0 ? 'N' : 'S';
  $ew = (float)$pt['lng'] >= 0 ? 'E' : 'W';
  return number_format(abs((float)$pt['lat']), 4) . "{$ns} " . number_format(abs((float)$pt['lng']), 4) . "{$ew}";
};

$fmtPace = function (float $distM, int $durationMs): string {
  if ($distM <= 0) return 'n/a';
  $minPerMile = ($durationMs / 1000 / 60) / ($distM / 1609.344);
  $m = (int) $minPerMile;
  $s = (int) round(($minPerMile - $m) * 60);
  if ($s === 60) { $m++; $s = 0; }
  return "{$m}:" . str_pad((string)$s, 2, '0', STR_PAD_LEFT) . ' min/mi';
};

if (!empty($trackers)) {
  $lines[] = '';
  $lines[] = $div;
  $lines[] = 'DISTANCE / TIME TRACKERS';
  $surveyStats = trailLogSurveyTrackingStats($trackers);
  $totalTrackerM  = $surveyStats['distanceM'];
  $totalTrackerMs = $surveyStats['durationMs'];
  foreach ($trackers as $tr) {
    if (!is_array($tr)) continue;
    $tName = trim((string)($tr['name'] ?? 'Unnamed')) ?: 'Unnamed';
    $tDist = trailLogTrackerDistanceM($tr);
    $tDur  = (int)  ($tr['activeDurationMs'] ?? 0);
    $lines[] = sprintf('  %-20s  %s, %s, %s', $tName . ':', $fmtMi($tDist), $fmtDur($tDur), $fmtPace($tDist, $tDur));
  }
  if (count($trackers) > 1) {
    $lines[] = '  ' . str_repeat('-', 18);
    $lines[] = sprintf('  %-20s  %s, %s, %s', 'Total:', $fmtMi($totalTrackerM), $fmtDur($totalTrackerMs), $fmtPace($totalTrackerM, $totalTrackerMs));
  }
}

if ($includeLocations && !empty($detailRows)) {
  $lines[] = '';
  $lines[] = $div;
  $lines[] = 'DETAILED LOG';
  foreach ($detailRows as $row) {
    $lines[] = $row['line'];
  }
}

// ── Tracker detail ────────────────────────────────────────────────
if ($includeLocations && !empty($trackers)) {
  foreach ($trackers as $idx => $tr) {
    if (!is_array($tr)) continue;
    $tName    = trim((string)($tr['name'] ?? 'Unnamed')) ?: 'Unnamed';
    $tDist    = trailLogTrackerDistanceM($tr);
    $tDur     = (int)  ($tr['activeDurationMs'] ?? 0);
    $tStart   = isset($tr['startedAt']) ? date('g:i A', intdiv((int)$tr['startedAt'], 1000)) : 'n/a';
    $segments = is_array($tr['segments'] ?? null) ? $tr['segments'] : [];
    $lines[] = '';
    $lines[] = $div;
    $lines[] = "TRACKER: {$tName}";
    $lines[] = "  Distance:  {$fmtMi($tDist)}    Duration: {$fmtDur($tDur)}    Pace: {$fmtPace($tDist, $tDur)}";
    $lines[] = "  Started:   {$tStart}   (" . count($segments) . ' segment' . (count($segments) !== 1 ? 's' : '') . ')';
    $prev_end = null;
    foreach ($segments as $si => $seg) {
      if (!is_array($seg)) continue;
      $segStart = isset($seg['startAt'])  ? date('g:i A', intdiv((int)$seg['startAt'], 1000)) : 'n/a';
      $segEnd   = isset($seg['endAt'])    ? date('g:i A', intdiv((int)$seg['endAt'],   1000)) : '(active)';
      $segDist  = (float)($seg['distanceM'] ?? 0);
      $segDurMs = isset($seg['startAt'], $seg['endAt'])
        ? (int)$seg['endAt'] - (int)$seg['startAt']
        : (isset($seg['startAt']) ? (int)(microtime(true) * 1000) - (int)$seg['startAt'] : 0);
      if ($prev_end !== null && isset($seg['startAt'])) {
        $breakMs  = (int)$seg['startAt'] - $prev_end;
        $lines[] = "    [Break: {$fmtDur($breakMs)}]";
      }
      $lines[] = "  Segment " . ($si + 1) . ": {$segStart} - {$segEnd}  ({$fmtDur($segDurMs)})  |  {$fmtMi($segDist)}";
      $lines[] = "    From: " . $fmtPt(is_array($seg['startPoint'] ?? null) ? $seg['startPoint'] : null);
      $waypoints = is_array($seg['waypoints'] ?? null) ? $seg['waypoints'] : [];
      foreach ($waypoints as $wi => $wp) {
        if (!is_array($wp)) continue;
        $wpDist = (float)($wp['segmentDistanceM'] ?? 0);
        $wpTs   = isset($wp['ts']) ? date('g:i A', intdiv((int)$wp['ts'], 1000)) : '--:--';
        $wpName = trim((string)($wp['name'] ?? ''));
        $nameStr = $wpName !== '' ? " \"{$wpName}\"" : '';
        $lines[] = "    Waypoint " . ($wi + 1) . "{$nameStr} [{$wpTs}] (" . $fmtMi($wpDist) . "): " . $fmtPt($wp);
      }
      $lines[] = "    To:   " . $fmtPt(is_array($seg['endPoint']   ?? null) ? $seg['endPoint']   : null);
      $prev_end = $seg['endAt'] ?? null;
    }
  }
}

$lines[] = '';
$lines[] = $div;
$lines[] = "Session started: {$startTime}";
$lines[] = "Report sent:     {$sentTime}";

$subject = "PWV Data Logger Report - {$reportDate}";

// ── Generate unique log ID and save to file ───────────────────────
$logDate  = date('Ymd');
$logTime  = date('Hi');
$logId    = $isGuest
  ? 'trailLog.g' . $logDate . $logTime . sprintf('%04d', mt_rand(0, 9999))
  : "trailLog.{$personId}{$logDate}{$logTime}";

$protocol   = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host       = $_SERVER['HTTP_HOST'] ?? 'localhost';
$spaUrl     = "{$protocol}://{$host}/trail-log/{$logId}";

$logPayload = [
  'logId'      => $logId,
  'personId'   => $personId,
  'member'     => $memberName,
  'email'      => $memberEmail,
  'reportDate' => $reportDate,
  'savedAt'    => date('Y-m-d H:i:s'),
  'summary'    => [
    'hikers' => [
      'seen'      => $hikerSeen,
      'contacted' => $hikerContacted,
      'total'     => $hikerTotal,
    ],
    'trees' => $trees,
  ],
  'trackers' => array_values(array_filter($trackers, 'is_array')),
  'entries'  => array_values(array_filter($entries,  'is_array')),
];

$savedLogId = null;
$dataLoggerDir = dirname(dirname(dirname(__DIR__))) . '/data-logger';
if (!is_dir($dataLoggerDir)) {
  @mkdir($dataLoggerDir, 0755, true);
}
if (is_dir($dataLoggerDir)) {
  $written = @file_put_contents(
    $dataLoggerDir . '/' . $logId . '.json',
    json_encode($logPayload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
  );
  if ($written !== false) {
    $savedLogId = $logId;
  }
}

// ── Prepend prominent map link to email body ──────────────────────
$linkBlock =
  "{$div}\n" .
  "  VIEW INTERACTIVE TRAIL MAP REPORT\n\n" .
  "  {$spaUrl}\n\n" .
  "{$div}\n\n\n";

if ($emailFormat === 'json') {
  $jsonPayload = [
    'mapUrl'     => $spaUrl,
    'member'     => $memberName,
    'date'       => $reportDate,
    'reportSent' => date('Y-m-d H:i:s'),
    'summary' => [
      'hikers' => [
        'seen'      => $hikerSeen,
        'contacted' => $hikerContacted,
        'total'     => $hikerTotal,
      ],
      'trees' => $trees,
    ],
    'trackers' => array_values(array_filter($trackers, 'is_array')),
    'entries'  => $includeLocations ? array_values(array_filter($entries, 'is_array')) : [],
  ];
  $reportBody = $linkBlock . json_encode($jsonPayload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
} else {
  $reportBody = $linkBlock . implode("\n", $lines);
}

$mailOk = sendOtpMail($memberEmail, $subject, $reportBody);
if (!$mailOk) {
  jsonOut([
    'success' => false,
    'error'   => 'Failed to send email to ' . $memberEmail . '. Please try again in a moment.',
    'email'   => $memberEmail,
    'logId'   => $savedLogId,
  ], 502);
}

jsonOut(['success' => true, 'logId' => $savedLogId, 'email' => $memberEmail]);
