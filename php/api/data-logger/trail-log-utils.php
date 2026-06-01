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
