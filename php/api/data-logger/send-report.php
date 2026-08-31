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
$appVersion       = trim($body['appVersion']  ?? '');
$entries          = is_array($body['entries'] ?? null) ? $body['entries'] : [];
$memberName       = trim($body['memberName']  ?? '');
// reportDate is the client session id, which since the trail-switch feature
// can carry an ISO time (2026-07-21T16:58:20). The report only wants the
// date — normalize here so the subject, the body "Date:" line, the saved
// payload and the map link all get a clean value.
$reportDate       = trim((string)($body['reportDate'] ?? ''));
$reportDate       = preg_match('/^\d{4}-\d{2}-\d{2}/', $reportDate)
  ? substr($reportDate, 0, 10)
  : date('Y-m-d');
$includeLocations = !empty($body['includeLocations']);
$trackers         = is_array($body['trackers'] ?? null) ? $body['trackers'] : [];
$trackers         = trailLogNormalizeTrackers($trackers);
$emailFormat      = (string)($body['emailFormat'] ?? 'text');
$wksiteId         = isset($body['wksiteId']) && $body['wksiteId'] !== null ? (int) $body['wksiteId'] : null;
$trailName        = trim((string)($body['trailName'] ?? ''));
// Logger profile: 'other' (e.g. sports) omits trail/hiker/tree/violation content.
$profile          = (string)($body['profile'] ?? 'patrol');
$isOther          = ($profile === 'other');
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
// People broken down by activity category. Legacy hiker entries with no
// activity are counted under 'hike'.
$activityKeys   = ['hike', 'bpack', 'bike', 'hunt', 'fish', 'stock'];
$activityLabels = ['hike' => 'Hike', 'bpack' => 'Bpack', 'bike' => 'Bike', 'hunt' => 'Hunt', 'fish' => 'Fish', 'stock' => 'Stock'];
$activityNouns  = ['hike' => 'Hiker', 'bpack' => 'Backpacker', 'bike' => 'Biker', 'hunt' => 'Hunter', 'fish' => 'Angler', 'stock' => 'Stock'];
$people         = [];
foreach ($activityKeys as $ak) { $people[$ak] = ['seen' => 0, 'contacted' => 0]; }
$dogOnLeash     = 0;
$dogOffLeash    = 0;
$trees = [
  'cleared' => ['small' => 0, 'medium' => 0, 'large' => 0, 'xl' => 0],
  'noted'   => ['small' => 0, 'medium' => 0, 'large' => 0, 'xl' => 0],
];
$sessionStart   = null;
$detailRows     = [];  // chronological list for the detail section
$summaryNotes   = [];  // time + text only, for the summary block
$violationRows  = [];  // type + note, for the violations summary block
$trailSequence  = [];  // trail-change events, for the header trail line
$byTrail        = [];  // per-trail tallies, keyed by trail name

// Chronological order so the running "current trail" tracking is correct
$entries = array_values(array_filter($entries, 'is_array'));
usort($entries, fn($a, $b) => ((int) ($a['timestamp'] ?? 0)) <=> ((int) ($b['timestamp'] ?? 0)));

$hasTrailEvents = false;
foreach ($entries as $e) {
  if ((string) ($e['type'] ?? '') === 'trail') { $hasTrailEvents = true; break; }
}

$noTrailKey  = '(no trail selected)';
$emptyTally  = function () use ($activityKeys): array {
  $people = [];
  foreach ($activityKeys as $ak) { $people[$ak] = ['seen' => 0, 'contacted' => 0]; }
  return [
    'seen' => 0, 'contacted' => 0, 'people' => $people,
    'dogs' => ['onLeash' => 0, 'offLeash' => 0],
    'trees' => [
      'cleared' => ['small' => 0, 'medium' => 0, 'large' => 0, 'xl' => 0],
      'noted'   => ['small' => 0, 'medium' => 0, 'large' => 0, 'xl' => 0],
    ],
    'violations' => 0, 'notes' => 0, 'firstTs' => PHP_INT_MAX,
  ];
};
$currentTrail = '';

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

  // Along-trail distance from trailhead (computed client-side at send time)
  $meta = "{$time} | {$coords}";
  if (isset($e['distFromTrailheadM']) && $e['distFromTrailheadM'] !== null) {
    $meta .= ' | ' . number_format((float) $e['distFromTrailheadM'] / 1609.344, 2) . ' mi from TH';
  }

  // Trail this entry belongs to: client stamp, else running trail from events,
  // else the session's single trail (legacy payloads without trail events)
  if ($type !== 'trail') {
    $entryTrail = trim((string) ($e['trailName'] ?? '')) ?: $currentTrail;
    if ($entryTrail === '' && !$hasTrailEvents && $trailName !== '') {
      $entryTrail = $trailName;
    }
    $groupKey = $entryTrail !== '' ? $entryTrail : $noTrailKey;
    if (!isset($byTrail[$groupKey])) $byTrail[$groupKey] = $emptyTally();
    $byTrail[$groupKey]['firstTs'] = min($byTrail[$groupKey]['firstTs'], $ts ?? 0);
  } else {
    $groupKey = null;
  }

  if ($type === 'hiker') {
    $sub = (string) ($e['hikerSubtype'] ?? '');
    $act = (string) ($e['hikerActivity'] ?? 'hike');
    if (!isset($people[$act])) $act = 'hike';
    if ($sub === 'seen') {
      $hikerSeen++; $byTrail[$groupKey]['seen']++;
      $people[$act]['seen']++; $byTrail[$groupKey]['people'][$act]['seen']++;
    } elseif ($sub === 'contacted') {
      $hikerContacted++; $byTrail[$groupKey]['contacted']++;
      $people[$act]['contacted']++; $byTrail[$groupKey]['people'][$act]['contacted']++;
    }
    $label        = ($activityNouns[$act] ?? 'Hiker') . ' - ' . ucfirst($sub);
    $detailRows[] = ['ts' => $ts ?? 0, 'subtype' => $sub, 'line' => "  [{$meta}] {$label}"];

  } elseif ($type === 'dog') {
    $ds = (string) ($e['dogSubtype'] ?? '');
    if ($ds === 'onLeash') {
      $dogOnLeash++;  $byTrail[$groupKey]['dogs']['onLeash']++;
    } elseif ($ds === 'offLeash') {
      $dogOffLeash++; $byTrail[$groupKey]['dogs']['offLeash']++;
    }
    $dogLabel     = $ds === 'offLeash' ? 'Off Leash' : ($ds === 'onLeash' ? 'On Leash' : 'Unknown');
    $detailRows[] = ['ts' => $ts ?? 0, 'subtype' => 'dog', 'line' => "  [{$meta}] Dog - {$dogLabel}"];

  } elseif ($type === 'tree') {
    $sub  = (string) ($e['treeSubtype'] ?? '');
    $size = (string) ($e['treeSize']    ?? '');
    if (isset($trees[$sub][$size])) {
      $trees[$sub][$size]++;
      $byTrail[$groupKey]['trees'][$sub][$size]++;
    }
    $sizeLabel    = ['small' => 'Small (<8")', 'medium' => 'Medium (8-15")', 'large' => 'Large (16-23")', 'xl' => 'XL (24-36")'][$size] ?? $size;
    $label        = 'Tree - ' . ucfirst($sub) . ', ' . $sizeLabel;
    $detailRows[] = ['ts' => $ts ?? 0, 'subtype' => $sub, 'line' => "  [{$meta}] {$label}"];

  } elseif ($type === 'note') {
    $text = trim((string) ($e['noteText'] ?? ''));
    if ($text === '') continue;
    $byTrail[$groupKey]['notes']++;
    $summaryNotes[] = ['ts' => $ts ?? 0, 'line' => "  [{$time}] {$text}"];
    $detailRows[]   = ['ts' => $ts ?? 0, 'subtype' => 'note', 'line' => "  [{$meta}] Note: {$text}"];

  } elseif ($type === 'violation') {
    $vType = trim((string) ($e['violationType'] ?? ''));
    $vNote = trim((string) ($e['violationNote'] ?? ''));
    $byTrail[$groupKey]['violations']++;
    $violationRows[] = ['ts' => $ts ?? 0, 'type' => $vType, 'note' => $vNote];
    $label = 'Violation - ' . ($vType ?: 'Unknown');
    if ($vNote !== '') $label .= ': ' . $vNote;
    $detailRows[] = ['ts' => $ts ?? 0, 'subtype' => 'violation', 'line' => "  [{$meta}] {$label}"];

  } elseif ($type === 'trail') {
    $tn    = trim((string) ($e['trailName'] ?? ''));
    $currentTrail = $tn;
    $label = $tn !== '' ? $tn : 'No trail selected (off PWV trail)';
    $trailSequence[] = ['ts' => $ts ?? 0, 'name' => $tn !== '' ? $tn : '(none)'];
    $detailRows[] = [
      'ts'      => $ts ?? 0,
      'subtype' => 'trail',
      'line'    => "\n  ===== TRAIL: {$label}  (from {$time}) =====\n",
    ];
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
$sentTime   = date('g:i A');

// Per-activity breakdown lines for a people tally, listing only categories that
// have at least one person. Falls back to a "none" note when empty.
$fmtPeopleLines = function (array $people, string $indent) use ($activityKeys, $activityLabels): array {
  $out = [];
  foreach ($activityKeys as $ak) {
    $p = $people[$ak] ?? ['seen' => 0, 'contacted' => 0];
    if ($p['seen'] === 0 && $p['contacted'] === 0) continue;
    $lbl   = str_pad($activityLabels[$ak], 6);
    $out[] = "{$indent}{$lbl} - Seen: {$p['seen']}  |  Contacted: {$p['contacted']}";
  }
  return $out;
};

// Header trail line: sequence of trail selections, or the session's final trail
usort($trailSequence, fn($a, $b) => $a['ts'] <=> $b['ts']);
$trailNamesSeq = [];
foreach ($trailSequence as $tsq) {
  if (end($trailNamesSeq) !== $tsq['name']) $trailNamesSeq[] = $tsq['name'];
}
if (empty($trailNamesSeq) && $trailName !== '') $trailNamesSeq = [$trailName];

$div = str_repeat('-', 22);

$lines = [
  $isOther ? 'PWV Data Logger Report' : 'PWV Trail Patrol - Data Logger Report',
  "Member:  {$memberName}",
  "Date:    {$reportDate}",
];
if (!empty($trailNamesSeq) && !$isOther) {
  $lines[] = (count($trailNamesSeq) === 1 ? 'Trail:   ' : 'Trails:  ') . implode(' -> ', $trailNamesSeq);
}
array_push($lines,
  '',
  $div,
  'SUMMARY',
);
if (!$isOther) {
  array_push($lines,
    '',
    'PEOPLE ENCOUNTERED',
  );
  foreach ($fmtPeopleLines($people, '  ') as $pl) { $lines[] = $pl; }
  array_push($lines,
    '  ' . str_repeat('-', 20),
    '  Total  - Seen: ' . $hikerSeen . '  |  Contacted: ' . $hikerContacted,
    '',
    'DOGS',
    "  On Leash:   {$dogOnLeash}",
    "  Off Leash:  {$dogOffLeash}",
    '  Total:      ' . ($dogOnLeash + $dogOffLeash),
    '',
    'TREES LOGGED',
    '  Cleared:  ' . $fmtRow($trees['cleared']),
    '  Noted:    ' . $fmtRow($trees['noted']),
  );
}

if (!empty($summaryNotes)) {
  usort($summaryNotes, fn($a, $b) => $a['ts'] <=> $b['ts']);
  $lines[] = '';
  $lines[] = 'FIELD NOTES';
  foreach ($summaryNotes as $n) {
    $lines[] = $n['line'];
  }
}

if (!empty($violationRows) && !$isOther) {
  usort($violationRows, fn($a, $b) => $a['ts'] <=> $b['ts']);
  $lines[] = '';
  $lines[] = 'VIOLATIONS (' . count($violationRows) . ')';
  foreach ($violationRows as $vr) {
    $line = '  ' . ($vr['type'] ?: 'Unknown');
    if ($vr['note'] !== '') $line .= ': ' . $vr['note'];
    $lines[] = $line;
  }
}

// ── Per-trail summary (PWV reports are segregated by trail) ─────────
$knownTrailKeys = array_filter(array_keys($byTrail), fn($k) => $k !== $noTrailKey);
if (!empty($knownTrailKeys) && !$isOther) {
  uasort($byTrail, fn($a, $b) => $a['firstTs'] <=> $b['firstTs']);
  $lines[] = '';
  $lines[] = $div;
  $lines[] = 'SUMMARY BY TRAIL';
  foreach ($byTrail as $tKey => $tt) {
    $lines[] = '';
    $lines[] = "TRAIL: {$tKey}";
    $lines[] = "  People - Seen: {$tt['seen']}  |  Contacted: {$tt['contacted']}  |  Total: {$tt['seen']}";
    foreach ($fmtPeopleLines($tt['people'] ?? [], '    ') as $pl) { $lines[] = $pl; }
    if (($tt['dogs']['onLeash'] ?? 0) > 0 || ($tt['dogs']['offLeash'] ?? 0) > 0) {
      $lines[] = "  Dogs - On Leash: {$tt['dogs']['onLeash']}  |  Off Leash: {$tt['dogs']['offLeash']}";
    }
    $lines[] = '  Trees Cleared:  ' . $fmtRow($tt['trees']['cleared']);
    $lines[] = '  Trees Noted:    ' . $fmtRow($tt['trees']['noted']);
    if ($tt['violations'] > 0) $lines[] = "  Violations: {$tt['violations']}";
    if ($tt['notes'] > 0)      $lines[] = "  Notes: {$tt['notes']}";
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

$fmtSpeed = function (float $distM, int $durationMs): string {
  if ($durationMs <= 0 || $distM <= 0) return 'n/a';
  $mph = ($distM / 1609.344) / ($durationMs / 1000 / 3600);
  return number_format($mph, 1) . ' mph';
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
    $lines[] = sprintf('  %-20s  %s, %s, %s, %s', $tName . ':', $fmtMi($tDist), $fmtDur($tDur), $fmtPace($tDist, $tDur), $fmtSpeed($tDist, $tDur));
  }
  if (count($trackers) > 1) {
    $lines[] = '  ' . str_repeat('-', 18);
    $lines[] = sprintf('  %-20s  %s, %s, %s, %s', 'Total:', $fmtMi($totalTrackerM), $fmtDur($totalTrackerMs), $fmtPace($totalTrackerM, $totalTrackerMs), $fmtSpeed($totalTrackerM, $totalTrackerMs));
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
    $lines[] = "  Distance:  {$fmtMi($tDist)}    Duration: {$fmtDur($tDur)}    Pace: {$fmtPace($tDist, $tDur)}    Speed: {$fmtSpeed($tDist, $tDur)}";
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
        $thStr   = isset($wp['distFromTrailheadM']) && $wp['distFromTrailheadM'] !== null
          ? ', ' . $fmtMi((float)$wp['distFromTrailheadM']) . ' from TH'
          : '';
        $lines[] = "    Waypoint " . ($wi + 1) . "{$nameStr} [{$wpTs}] (" . $fmtMi($wpDist) . "{$thStr}): " . $fmtPt($wp);
      }
      $lines[] = "    To:   " . $fmtPt(is_array($seg['endPoint']   ?? null) ? $seg['endPoint']   : null);
      $prev_end = $seg['endAt'] ?? null;
    }
  }
}

$dataLoggerDir = dirname(dirname(dirname(__DIR__))) . '/data-logger';
$photosDir     = $dataLoggerDir . '/photos';
if (!is_dir($dataLoggerDir)) {
  @mkdir($dataLoggerDir, 0755, true);
}

// ── Generate unique log ID (needed to name photo files) ───────────
// The id encodes {personId}{Ymd}{His}. It used to carry only {Hi}, which
// collided when the offline queue flushed several reports inside one minute
// on reconnect — each write silently overwrote the last. Seconds shrink that
// window; the claim loop below closes it, appending a 2-digit sequence when
// the name is already taken. Everything stays digit-only so get-log.php's
// /^trailLog\.[0-9]+$/ validator keeps accepting it.
$logStamp = date('YmdHis');
$logBase  = $isGuest
  ? 'trailLog.g' . $logStamp
  : "trailLog.{$personId}{$logStamp}";

$logId = $logBase;
for ($seq = 0; $seq < 100; $seq++) {
  $candidate = $seq === 0 ? $logBase : $logBase . sprintf('%02d', $seq);
  // 'x' fails rather than truncating if the name was claimed since we looked,
  // so concurrent flushes of the same queue can't land on one file.
  $h = @fopen($dataLoggerDir . '/' . $candidate . '.json', 'x');
  if ($h !== false) {
    fclose($h);
    $logId = $candidate;
    break;
  }
}

$protocol   = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host       = $_SERVER['HTTP_HOST'] ?? 'localhost';
$spaUrl     = "{$protocol}://{$host}/trail-log/{$logId}";

// ── Save captured photos to disk; swap base64 for a public URL ─────
$photoLinks    = [];
foreach ($entries as $ei => $pe) {
  if (!is_array($pe) || ($pe['type'] ?? '') !== 'photo') continue;
  $url = '';
  $raw = (string) ($pe['photoData'] ?? '');
  if ($raw !== '') {
    // Inline base64 fallback (e.g. a photo captured/sent without the pre-upload step)
    unset($entries[$ei]['photoData']); // never persist base64 in the log JSON
    if (preg_match('#^data:image/[\w.+-]+;base64,#', $raw)) {
      $raw = substr($raw, strpos($raw, ',') + 1);
    }
    $bin = base64_decode($raw, true);
    if ($bin !== false) {
      $pid = preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($pe['photoId'] ?? ''));
      if ($pid === '') $pid = 'p' . $ei;
      $fname = "{$logId}_{$pid}.jpg";
      if (!is_dir($photosDir)) @mkdir($photosDir, 0755, true);
      if (is_dir($photosDir) && @file_put_contents($photosDir . '/' . $fname, $bin) !== false) {
        $url = "/api/data-logger/get-photo.php?file={$fname}";
        $entries[$ei]['photoUrl'] = $url;
      }
    }
  } elseif (!empty($pe['photoUrl'])) {
    // Already uploaded via upload-photo.php — just reference it
    $url = (string) $pe['photoUrl'];
  }
  if ($url === '') continue;
  $plat = isset($pe['lat']) && $pe['lat'] !== null ? (float) $pe['lat'] : null;
  $plng = isset($pe['lng']) && $pe['lng'] !== null ? (float) $pe['lng'] : null;
  $fullUrl = preg_match('#^https?://#', $url) ? $url : "{$protocol}://{$host}{$url}";
  $photoLinks[] = [
    'ts'      => (int) ($pe['timestamp'] ?? 0),
    'caption' => trim((string) ($pe['noteText'] ?? '')),
    'coords'  => $fmtCoords($plat, $plng),
    'url'     => $fullUrl,
  ];
}
if (!empty($photoLinks)) {
  usort($photoLinks, fn($a, $b) => $a['ts'] <=> $b['ts']);
  $lines[] = '';
  $lines[] = $div;
  $lines[] = 'PHOTOS (' . count($photoLinks) . ')';
  foreach ($photoLinks as $pl) {
    $ptime = $pl['ts'] ? date('g:i A', intdiv($pl['ts'], 1000)) : '--:--';
    // GPS shown only when the sender opted to include locations
    $meta  = $includeLocations ? "{$ptime} | {$pl['coords']}" : $ptime;
    $lines[] = "  [{$meta}] " . ($pl['caption'] !== '' ? $pl['caption'] : '(no caption)');
    $lines[] = "    {$pl['url']}";
  }
}

$lines[] = '';
$lines[] = $div;
// Session start: earliest logged entry, falling back to the earliest tracker
// start — sports/"other" sessions often carry trackers but no tapped entries,
// which otherwise left a bare "Session started: n/a".
$sessionStartMs = $sessionStart;
if ($sessionStartMs === null) {
  foreach ($trackers as $tr) {
    if (!is_array($tr)) continue;
    $cands = [$tr['startedAt'] ?? null];
    foreach ((is_array($tr['segments'] ?? null) ? $tr['segments'] : []) as $seg) {
      if (is_array($seg)) $cands[] = $seg['startAt'] ?? null;
    }
    foreach ($cands as $c) {
      if ($c === null) continue;
      $c = (int) $c;
      if ($c > 0 && ($sessionStartMs === null || $c < $sessionStartMs)) $sessionStartMs = $c;
    }
  }
}
if ($sessionStartMs !== null) {
  $lines[] = 'Session started: ' . date('g:i A', intdiv($sessionStartMs, 1000));
}
$lines[] = "Report sent:     {$sentTime}";
if ($appVersion !== '') {
  $lines[] = '';
  $lines[] = "v{$appVersion}";
}

// Name the trail in the subject so each per-trail report is distinct in the
// inbox — without it, same-day reports share one subject and Gmail threads
// them into a single conversation, hiding all but the latest.
$subjectTrail = (!$isOther && $trailName !== '') ? " - {$trailName}" : '';
$subject = "PWV Data Logger Report{$subjectTrail} - {$reportDate}";

$logPayload = [
  'logId'      => $logId,
  'personId'   => $personId,
  'member'     => $memberName,
  'email'      => $memberEmail,
  'reportDate' => $reportDate,
  'savedAt'    => date('Y-m-d H:i:s'),
  'profile'    => $profile,
  'wksiteId'   => $wksiteId,
  'trailName'  => $trailName !== '' ? $trailName : null,
  'summary'    => [
    'hikers' => [
      'seen'       => $hikerSeen,
      'contacted'  => $hikerContacted,
      'total'      => $hikerTotal,
      'byActivity' => $people,
    ],
    'dogs'  => ['onLeash' => $dogOnLeash, 'offLeash' => $dogOffLeash, 'total' => $dogOnLeash + $dogOffLeash],
    'trees' => $trees,
  ],
  'trackers' => array_values(array_filter($trackers, 'is_array')),
  'entries'  => array_values(array_filter($entries,  'is_array')),
];

$savedLogId = null;
if (is_dir($dataLoggerDir)) {
  // The name was already claimed as an empty file above; this fills it in.
  $logFile = $dataLoggerDir . '/' . $logId . '.json';
  $written = @file_put_contents(
    $logFile,
    json_encode($logPayload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
  );
  if ($written !== false) {
    $savedLogId = $logId;
  } else {
    // Don't leave the zero-byte placeholder sitting there as a phantom log.
    @unlink($logFile);
  }
}

// ── Prepend prominent map link to email body ──────────────────────
$mapLabel  = $isOther ? 'VIEW INTERACTIVE MAP REPORT' : 'VIEW INTERACTIVE TRAIL MAP REPORT';
$linkBlock =
  "{$div}\n" .
  "  {$mapLabel}\n\n" .
  "  {$spaUrl}\n\n" .
  "{$div}\n\n\n";

if ($emailFormat === 'json') {
  $jsonPayload = [
    'mapUrl'     => $spaUrl,
    'member'     => $memberName,
    'date'       => $reportDate,
    'reportSent' => date('Y-m-d H:i:s'),
    'wksiteId'   => $wksiteId,
    'trailName'  => $trailName !== '' ? $trailName : null,
    'summary' => [
      'hikers' => [
        'seen'       => $hikerSeen,
        'contacted'  => $hikerContacted,
        'total'      => $hikerTotal,
        'byActivity' => $people,
      ],
      'dogs'  => ['onLeash' => $dogOnLeash, 'offLeash' => $dogOffLeash, 'total' => $dogOnLeash + $dogOffLeash],
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
