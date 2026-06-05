<?php
/**
 * Shared helpers for trail log IDs: trailLog.{personId}{Ymd}{Hi}
 */

/** Extract PersonID prefix from a trail log id (0 when unknown). */
function trailLogPersonIdFromLogId(string $logId): int {
  if (!preg_match('/^trailLog\.(\d+)$/', $logId, $m)) {
    return 0;
  }
  $inner = $m[1];
  if (strlen($inner) < 13) {
    return 0;
  }
  $dateTime = substr($inner, -12);
  if (!preg_match('/^\d{12}$/', $dateTime)) {
    return 0;
  }
  $dateStr = substr($dateTime, 0, 8);
  $timeStr = substr($dateTime, 8, 4);
  if (!DateTime::createFromFormat('Ymd', $dateStr) || !DateTime::createFromFormat('Hi', $timeStr)) {
    return 0;
  }
  $pid = substr($inner, 0, -12);
  if ($pid === '' || !ctype_digit($pid)) {
    return 0;
  }
  return (int) $pid;
}

/** Resolve PersonID from saved log JSON + log id, with email fallback for legacy files. */
function trailLogResolvePersonId(PDO $db, array $json, string $logId): int {
  $pid = (int) ($json['personId'] ?? 0);
  if ($pid > 0) {
    return $pid;
  }

  $pid = trailLogPersonIdFromLogId($logId);
  if ($pid > 0) {
    return $pid;
  }

  $email = strtolower(trim((string) ($json['email'] ?? '')));
  if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) {
    try {
      $stmt = $db->prepare(
        'SELECT PersonID FROM t_member WHERE LOWER(TRIM(EmailAddress)) = ? LIMIT 1'
      );
      $stmt->execute([$email]);
      $row = $stmt->fetch(PDO::FETCH_ASSOC);
      if ($row) {
        $pid = (int) $row['PersonID'];
        if ($pid > 0) {
          return $pid;
        }
      }
    } catch (Throwable $_) {
      /* ignore lookup failure */
    }
  }

  return 0;
}

// ── GPS distance helpers (mirror src/lib/gpsDistance.ts) ─────────────

function trailLogHaversineM(float $lat1, float $lng1, float $lat2, float $lng2): float {
  $R = 6371000.0;
  $toRad = fn(float $d): float => $d * M_PI / 180.0;
  $dLat = $toRad($lat2 - $lat1);
  $dLng = $toRad($lng2 - $lng1);
  $a = sin($dLat / 2) ** 2
    + cos($toRad($lat1)) * cos($toRad($lat2)) * sin($dLng / 2) ** 2;
  return $R * 2 * atan2(sqrt($a), sqrt(1 - $a));
}

/** @param list<array{lat: float, lng: float}> $points */
function trailLogGpsPathDistanceM(array $points): float {
  $total = 0.0;
  for ($i = 1, $n = count($points); $i < $n; $i++) {
    $total += trailLogHaversineM(
      $points[$i - 1]['lat'], $points[$i - 1]['lng'],
      $points[$i]['lat'],     $points[$i]['lng'],
    );
  }
  return $total;
}

function trailLogTrackerDistanceM(array $tracker): float {
  $best = (float) ($tracker['totalDistanceM'] ?? 0);
  $segments = is_array($tracker['segments'] ?? null) ? $tracker['segments'] : [];
  foreach ($segments as $seg) {
    if (!is_array($seg)) continue;
    $points = [];
    $start = $seg['startPoint'] ?? null;
    if (is_array($start) && isset($start['lat'], $start['lng'])) {
      $points[] = ['lat' => (float) $start['lat'], 'lng' => (float) $start['lng']];
    }
    $waypoints = is_array($seg['waypoints'] ?? null) ? $seg['waypoints'] : [];
    usort($waypoints, fn($a, $b) => ((int) ($a['ts'] ?? 0)) <=> ((int) ($b['ts'] ?? 0)));
    foreach ($waypoints as $wp) {
      if (!is_array($wp) || !isset($wp['lat'], $wp['lng'])) continue;
      $points[] = ['lat' => (float) $wp['lat'], 'lng' => (float) $wp['lng']];
    }
    $end = $seg['endPoint'] ?? null;
    if (is_array($end) && isset($end['lat'], $end['lng'])) {
      $last = $points[count($points) - 1] ?? null;
      if (!$last || $last['lat'] !== (float) $end['lat'] || $last['lng'] !== (float) $end['lng']) {
        $points[] = ['lat' => (float) $end['lat'], 'lng' => (float) $end['lng']];
      }
    }
    if (count($points) >= 2) {
      $best = max($best, trailLogGpsPathDistanceM($points));
    }
  }
  return $best;
}

/** @param list<array<string, mixed>> $trackers */
function trailLogTrackersWallClockDurationMs(array $trackers): int {
  if ($trackers === []) return 0;
  $start = PHP_INT_MAX;
  $end = 0;
  foreach ($trackers as $t) {
    if (!is_array($t)) continue;
    $start = min($start, (int) ($t['startedAt'] ?? PHP_INT_MAX));
    $segments = is_array($t['segments'] ?? null) ? $t['segments'] : [];
    foreach ($segments as $seg) {
      if (!is_array($seg)) continue;
      $segEnd = (int) ($seg['endAt'] ?? $seg['startAt'] ?? 0);
      $end = max($end, $segEnd);
    }
  }
  return ($start === PHP_INT_MAX || $end <= $start) ? 0 : $end - $start;
}

/** @param list<array<string, mixed>> $trackers */
function trailLogSurveyTrackingStats(array $trackers): array {
  $distanceM = 0.0;
  foreach ($trackers as $t) {
    if (is_array($t)) $distanceM += trailLogTrackerDistanceM($t);
  }
  $durationMs = count($trackers) <= 1
    ? (int) ($trackers[0]['activeDurationMs'] ?? trailLogTrackersWallClockDurationMs($trackers))
    : trailLogTrackersWallClockDurationMs($trackers);
  return ['distanceM' => $distanceM, 'durationMs' => $durationMs];
}

/** Normalize tracker distance fields from GPS path data. */
function trailLogNormalizeTrackers(array $trackers): array {
  $out = [];
  foreach ($trackers as $tr) {
    if (!is_array($tr)) continue;
    $tr['totalDistanceM'] = trailLogTrackerDistanceM($tr);
    $out[] = $tr;
  }
  return $out;
}
