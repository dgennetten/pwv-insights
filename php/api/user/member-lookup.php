<?php
/**
 * Fetch member info + season activity — any signed-in PWV member.
 * POST body: { token, memberId }
 */
require_once __DIR__ . '/../config.php';

define('ML_PWV_GROUP', 10);

/** Build a public photo URL from t_member.Photo (filename or absolute URL). */
function memberPhotoUrl(?string $photo): ?string {
  $photo = trim((string) $photo);
  if ($photo === '') return null;
  if (preg_match('#^https?://#i', $photo)) return $photo;
  return PWV_MEMBER_PHOTO_BASE . rawurlencode(basename($photo));
}

/** Human-readable membership status. */
function memberStatusLabel(
  ?string $orgStatusName,
  $memberSince,
  ?string $agreementDate,
  $lockedInactive
): string {
  if ((int) $lockedInactive === 1) return 'Inactive';
  $name = trim((string) $orgStatusName);
  if (strcasecmp($name, 'Active') === 0) {
    $since = trim((string) $memberSince);
    if ($since !== '' && $since !== '0000') return 'Active since ' . $since;
    if ($agreementDate !== null && $agreementDate !== '' && $agreementDate !== '0000-00-00') {
      try { return 'Active since ' . (new DateTime($agreementDate))->format('F j, Y'); }
      catch (Throwable $_) {}
    }
    return 'Active';
  }
  return $name !== '' ? $name : '—';
}

/** Comma-separated MemTypeIDs → display names. */
function resolveMemberTypes(PDO $db, ?string $memTypeIds): ?string {
  $raw = trim((string) $memTypeIds);
  if ($raw === '') return null;
  $ids = [];
  foreach (explode(',', $raw) as $part) {
    $id = (int) trim($part);
    if ($id > 0) $ids[] = $id;
  }
  if ($ids === []) return null;
  $placeholders = implode(',', array_fill(0, count($ids), '?'));
  $stmt = $db->prepare(
    "SELECT MemTypeName FROM lu_member_type WHERE MemTypeID IN ($placeholders) ORDER BY DisplayOrder, MemTypeID"
  );
  $stmt->execute($ids);
  $names = array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN));
  return $names !== [] ? implode(', ', $names) : null;
}

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  jsonOut(['success' => false, 'error' => 'Method not allowed'], 405);
}

$body     = json_decode(file_get_contents('php://input'), true) ?? [];
$token    = trim($body['token'] ?? '');
$memberId = (int) ($body['memberId'] ?? 0);

if ($token === '' || strlen($token) !== 64 || !ctype_xdigit($token)) {
  jsonOut(['success' => false, 'error' => 'Invalid token'], 401);
}
if ($memberId < 1) {
  jsonOut(['success' => false, 'error' => 'Invalid memberId'], 400);
}

$db = getDb();

$stmt = $db->prepare(
  'SELECT s.expires_at, m.EmailAddress
   FROM auth_sessions s
   JOIN t_member m ON m.PersonID = s.person_id
   WHERE s.token = ? LIMIT 1'
);
$stmt->execute([$token]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$row) jsonOut(['success' => false, 'error' => 'Unknown session'], 401);
$exp = strtotime($row['expires_at']);
if ($exp === false || $exp < time()) jsonOut(['success' => false, 'error' => 'Session expired'], 401);

// Only the super admin sees birth date / age (same PII gate as the Admin member lookup).
$isAdmin = strtolower(trim($row['EmailAddress'] ?? '')) === strtolower(ADMIN_EMAIL);

// ── Member core info ──────────────────────────────────────────────────────────
$stmt = $db->prepare(
  'SELECT m.PersonID, m.FirstName, m.LastName, m.BirthDate, m.EmailAddress, m.Photo,
          mg.OrgStatusID, os.OrgStatusName, mg.MemberSince, mg.AgreementDate, mg.MemTypeIDs,
          lo.IsInactive AS LockedInactive
   FROM t_member m
   LEFT JOIN t_mem_group mg ON mg.PersonID = m.PersonID AND mg.GroupID = ?
   LEFT JOIN lu_org_status os ON os.OrgStatusID = mg.OrgStatusID
   LEFT JOIN t_locked_out lo ON lo.PersonID = m.PersonID
   WHERE m.PersonID = ?
   LIMIT 1'
);
$stmt->execute([ML_PWV_GROUP, $memberId]);
$m = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$m) jsonOut(['success' => false, 'error' => 'Member not found'], 404);

$photoUrl    = memberPhotoUrl($m['Photo'] ?? null);
$statusLabel = memberStatusLabel(
  $m['OrgStatusName'] ?? null,
  $m['MemberSince'] ?? null,
  $m['AgreementDate'] ?? null,
  $m['LockedInactive'] ?? null
);
$memberType = resolveMemberTypes($db, $m['MemTypeIDs'] ?? null);

// ── Age / DOB (super admin only) ──────────────────────────────────────────────
$age = null;
$dob = null;
if ($isAdmin && !empty($m['BirthDate']) && $m['BirthDate'] !== '0000-00-00') {
  try {
    $bd  = new DateTime($m['BirthDate']);
    $age = (int) $bd->diff(new DateTime())->y;
    $dob = $bd->format('F j, Y');
  } catch (Throwable $_) {}
}

// ── Address ───────────────────────────────────────────────────────────────────
$stmt = $db->prepare(
  'SELECT StreetAddress, City, State, ZipCode
   FROM t_mem_address WHERE PersonID = ? ORDER BY MemAddressID ASC LIMIT 1'
);
$stmt->execute([$memberId]);
$addr = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

// ── Phone ─────────────────────────────────────────────────────────────────────
$stmt = $db->prepare(
  'SELECT PhoneNumber FROM t_mem_phone
   WHERE PersonID = ? ORDER BY COALESCE(PhonePrimary, 0) DESC, MemPhoneID ASC LIMIT 1'
);
$stmt->execute([$memberId]);
$phoneRow = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

// ── Season patrol stats (Oct 1 – Sep 30) ─────────────────────────────────────
$mo          = (int) date('n');
$yr          = (int) date('Y');
$seasonStart = ($mo >= 10) ? "$yr-10-01" : ($yr - 1) . '-10-01';
$scope       = 'r.GroupID = ' . ML_PWV_GROUP
             . ' AND (r.IsDraft IS NULL OR r.IsDraft = 0)'
             . ' AND (r.IsUnofficial IS NULL OR r.IsUnofficial = 0)'
             . " AND r.ActivityDate >= '$seasonStart'";

$s = $db->prepare(
  "SELECT COUNT(DISTINCT r.ReportID)
   FROM t_report_member rm
   JOIN t_report r ON r.ReportID = rm.ReportID
   WHERE rm.PersonID = ? AND $scope"
);
$s->execute([$memberId]);
$memberDays = (int)($s->fetchColumn() ?? 0);
$s->closeCursor();

$s2 = $db->prepare(
  "SELECT ROUND(AVG(cnt), 1) FROM (
     SELECT COUNT(DISTINCT r.ReportID) AS cnt
     FROM t_report_member rm
     JOIN t_report r ON r.ReportID = rm.ReportID
     WHERE $scope
     GROUP BY rm.PersonID
   ) sub"
);
$s2->execute();
$avgDays    = (float)($s2->fetchColumn() ?? 0);
$meritRatio = $avgDays > 0 ? round($memberDays / $avgDays, 2) : null;
$s2->closeCursor();

// ── Last patrol date (all-time) ───────────────────────────────────────────────
$lastPatrolDate = null;
$s3 = $db->query(
  'SELECT MAX(r.ActivityDate)
   FROM t_report_member rm
   JOIN t_report r ON r.ReportID = rm.ReportID
   WHERE rm.PersonID = ' . $memberId . '
     AND r.GroupID = ' . ML_PWV_GROUP . '
     AND (r.IsDraft IS NULL OR r.IsDraft = 0)
     AND (r.IsUnofficial IS NULL OR r.IsUnofficial = 0)'
);
if ($s3) {
  $lastPatrolRaw = $s3->fetchColumn() ?: null;
  if ($lastPatrolRaw && $lastPatrolRaw !== '0000-00-00') {
    try { $lastPatrolDate = (new DateTime($lastPatrolRaw))->format('F j, Y'); }
    catch (Throwable $_) {}
  }
}

// ── Response ──────────────────────────────────────────────────────────────────
jsonOut([
  'success' => true,
  'member'  => [
    'memberId'       => (int)   $m['PersonID'],
    'fullName'       => trim(($m['FirstName'] ?? '') . ' ' . ($m['LastName'] ?? '')),
    'email'          => trim($m['EmailAddress'] ?? ''),
    'dateOfBirth'    => $dob,
    'age'            => $age,
    'address'        => ($addr['StreetAddress'] ?? '') !== '' ? trim($addr['StreetAddress']) : null,
    'city'           => ($addr['City']          ?? '') !== '' ? trim($addr['City'])          : null,
    'state'          => ($addr['State']         ?? '') !== '' ? trim($addr['State'])         : null,
    'zip'            => ($addr['ZipCode']       ?? '') !== '' ? trim($addr['ZipCode'])       : null,
    'phone'          => ($phoneRow['PhoneNumber'] ?? '') !== '' ? trim($phoneRow['PhoneNumber']) : null,
    'memberType'     => $memberType,
    'photoUrl'       => $photoUrl,
    'status'         => $statusLabel,
    'lastPatrolDate' => $lastPatrolDate,
    'merit' => [
      'memberDays'  => $memberDays,
      'avgDays'     => $avgDays,
      'ratio'       => $meritRatio,
      'seasonStart' => $seasonStart,
    ],
  ],
]);
