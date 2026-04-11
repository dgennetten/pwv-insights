<?php
require_once __DIR__ . '/../config.php';

define('PWV_GROUP', 10);

/** Trees cleared (work done) — not t_rpt_tree_down (hazards / trees down). */
define('TREES_CLEARED_TABLE', 't_rpt_trail_clearing');

/**
 * lu_trail_clearing: IDs 1–5 = tree size chart buckets (NumCleared = tree count).
 * Brushing/limbing IDs (default 6–8) use feet — excluded from tree totals.
 * Must load before the main request try block (functions use these during the request).
 */
define('TRAIL_CLEARING_TREE_ID_MIN', 1);
define('TRAIL_CLEARING_TREE_ID_MAX', 5);

/** Backtick-wrapped identifier for SQL (avoid breaking double-quoted PHP strings). */
function treesClearedTableRef(): string {
  return '`' . TREES_CLEARED_TABLE . '`';
}

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

try {
  // ─── Input ──────────────────────────────────────────────────────────────────
  $timeRange = $_GET['timeRange'] ?? '7d';
  if (!in_array($timeRange, ['7d','1m','3m','1y','all'], true)) $timeRange = '7d';

  $memberRaw = $_GET['memberContext'] ?? 'all';
  $memberCtx = resolveMemberContext($memberRaw);

  $db = getDb();

  // ─── Date ranges ───────────────────────────────────────────────────────────
  [$start, $end, $prevStart, $prevEnd] = dateRange($timeRange);

  $summaryZeros = [
    'patrols'            => 0,
    'trailsCovered'      => 0,
    'totalActiveMembers' => 0,
    'volunteerHours'     => 0.0,
    'treesCleared'       => 0.0,
  ];

  // ─── Build & return (each block isolated so one bad query does not 500 the whole dashboard) ──
  $cur = $summaryZeros;
  try {
    $cur = summary($db, $start, $end, $memberCtx);
  } catch (Throwable $e) {
    error_log('dashboard summary(current): ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
  }

  $prev = null;
  if ($prevStart) {
    try {
      $prev = summary($db, $prevStart, $prevEnd, $memberCtx);
    } catch (Throwable $e) {
      error_log('dashboard summary(prev): ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
      $prev = $summaryZeros;
    }
  }

  // KPI "hikers seen" = sum of per-trail Seen column (same source as Trail Coverage table)
  $trailCoverage = [];
  try {
    $trailCoverage = trailCoverage($db, $start, $end, $memberCtx);
  } catch (Throwable $e) {
    error_log('dashboard trailCoverage(current): ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
  }
  $hikersSeenCur = sumTrailHikersSeen($trailCoverage);

  $prevTrailCov = [];
  if ($prevStart) {
    try {
      $prevTrailCov = trailCoverage($db, $prevStart, $prevEnd, $memberCtx);
    } catch (Throwable $e) {
      error_log('dashboard trailCoverage(prev): ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
    }
  }
  $hikersSeenPrev = $prevStart ? sumTrailHikersSeen($prevTrailCov) : 0;

  $patrolsByTrailId = [];
  try {
    $patrolsByTrailId = patrolsByTrail($db, $start, $end, $memberCtx);
  } catch (Throwable $e) {
    error_log('dashboard patrolsByTrail: ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
  }

  $violationsByCategory = [];
  try {
    $violationsByCategory = violations($db, $start, $end, $memberCtx);
  } catch (Throwable $e) {
    error_log('dashboard violations: ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
  }

  $treesClearedPayload = treesClearedSafeEmpty();
  try {
    $treesClearedPayload = treesCleared($db, $start, $end, $memberCtx);
  } catch (Throwable $e) {
    error_log('dashboard treesCleared: ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
  }

  $membersByAge = [];
  try {
    $membersByAge = membersByAge($db, $start, $end);
  } catch (Throwable $e) {
    error_log('dashboard membersByAge: ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
  }

  $members = [];
  try {
    $members = members($db);
  } catch (Throwable $e) {
    error_log('dashboard members: ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
  }

  $patrolActivity = [];
  try {
    $patrolActivity = patrolActivity($db, $start, $end, $memberCtx, $timeRange);
  } catch (Throwable $e) {
    error_log('dashboard patrolActivity: ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
  }

  jsonOut([
    'summary'              => [
      'patrols'              => $cur['patrols'],
      'patrolsDelta'         => $prev ? $cur['patrols']         - $prev['patrols']         : 0,
      'trailsCovered'        => $cur['trailsCovered'],
      'trailsCoveredDelta'   => $prev ? $cur['trailsCovered']   - $prev['trailsCovered']   : 0,
      'treesCleared'         => $cur['treesCleared'],
      'treesClearedDelta'    => $prev ? $cur['treesCleared']    - $prev['treesCleared']    : 0,
      'hikersSeen'           => $hikersSeenCur,
      'hikersSeenDelta'      => $prevStart ? ($hikersSeenCur - $hikersSeenPrev) : 0,
      'volunteerHours'       => $cur['volunteerHours'],
      'totalActiveMembers'   => $cur['totalActiveMembers'],
      'periodLabel'          => periodLabel($start, $end),
    ],
    'patrolActivity'       => $patrolActivity,
    'trailCoverage'        => $trailCoverage,
    'patrolsByTrailId'     => $patrolsByTrailId,
    'violationsByCategory' => $violationsByCategory,
    'treesCleared'         => $treesClearedPayload,
    'membersByAge'         => $membersByAge,
    'members'              => $members,
  ]);
} catch (Throwable $e) {
  http_response_code(500);
  header('Content-Type: application/json');
  header('Access-Control-Allow-Origin: *');
  echo json_encode([
    'ok'     => false,
    'error'  => 'Dashboard query failed',
    'detail' => $e->getMessage(),
    'file'   => $e->getFile(),
    'line'   => $e->getLine(),
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Valid positive t_member.PersonID only. Rejects "undefined", "", floats, 0 — those
 * would cast to PersonID 0 and make member-scoped KPIs (trees, patrols) nearly empty.
 */
function resolveMemberContext($raw) {
  if ($raw === null || $raw === false) {
    return 'all';
  }
  $s = trim((string)$raw);
  if ($s === '' || strcasecmp($s, 'all') === 0) {
    return 'all';
  }
  if (!preg_match('/^\d+$/', $s)) {
    return 'all';
  }
  $id = (int)$s;
  return $id > 0 ? $id : 'all';
}

function dateRange(string $r): array {
  $today = date('Y-m-d');
  switch ($r) {
    case '7d':
      return [date('Y-m-d', strtotime('-7 days')), $today,
              date('Y-m-d', strtotime('-14 days')), date('Y-m-d', strtotime('-8 days'))];
    case '1m':
      return [date('Y-m-d', strtotime('-30 days')), $today,
              date('Y-m-d', strtotime('-60 days')), date('Y-m-d', strtotime('-31 days'))];
    case '3m':
      $sy = date('Y-01-01');
      $py = (date('Y') - 1) . '-01-01';
      $pe = date((date('Y') - 1) . substr($today, 4));
      return [$sy, $today, $py, $pe];
    case '1y':
      return [date('Y-m-d', strtotime('-365 days')), $today,
              date('Y-m-d', strtotime('-730 days')), date('Y-m-d', strtotime('-366 days'))];
    default: // all
      return [null, null, null, null];
  }
}

function periodLabel(?string $s, ?string $e): string {
  if (!$s) return 'All time';
  $sd = new DateTime($s); $ed = new DateTime($e);
  if ($sd->format('Y') === $ed->format('Y')) {
    return $sd->format('M j') . ' – ' . $ed->format('M j, Y');
  }
  return $sd->format('M j, Y') . ' – ' . $ed->format('M j, Y');
}

/** True if SELECT on identifier succeeds (handles hosts where SHOW COLUMNS is denied). */
function tableHasColumn(PDO $db, string $table, string $col): bool {
  static $cache = [];
  if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $table) || !preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $col)) {
    return false;
  }
  $key = $table . '.' . $col;
  if (array_key_exists($key, $cache)) {
    return $cache[$key];
  }
  try {
    $db->query('SELECT `' . $col . '` FROM `' . $table . '` LIMIT 0');
    $cache[$key] = true;
    return true;
  } catch (Throwable $e) {
    $cache[$key] = false;
    return false;
  }
}

/** @return list<string> PersonID-style columns on t_report to OR with roster (empty = roster only). */
function detectReportPersonColumns(PDO $db): array {
  static $resolved = false;
  static $cols = null;
  if ($resolved) {
    return $cols;
  }
  $resolved = true;
  $secrets = getSecrets();
  if (array_key_exists('t_report_person_column', $secrets) && $secrets['t_report_person_column'] === false) {
    $cols = [];
    return $cols;
  }
  if (!empty($secrets['t_report_person_column']) && is_string($secrets['t_report_person_column'])) {
    $c = $secrets['t_report_person_column'];
    if (preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $c) && tableHasColumn($db, 't_report', $c)) {
      $cols = [$c];
      return $cols;
    }
    $cols = [];
    return $cols;
  }
  $candidates = [
    'ReporterID', // PWV patrol filing column
    'ReportWriterID', // Canyon Lakes / PWV — filer not always in t_report_member
    'SubmittedByPersonID',
    'EnteredByPersonID',
    'CreatedByPersonID',
    'ReportingPersonID',
    'PrimaryReporterPersonID',
    'ReportPersonID',
  ];
  $fields = [];
  try {
    $stmt = $db->query('SHOW COLUMNS FROM t_report');
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
      $fields[$row['Field']] = true;
    }
  } catch (Throwable $e) {
    $fields = null;
  }
  $cols = [];
  if ($fields !== null) {
    foreach ($candidates as $c) {
      if (!empty($fields[$c])) {
        $cols[] = $c;
      }
    }
  } else {
    foreach ($candidates as $c) {
      if (tableHasColumn($db, 't_report', $c)) {
        $cols[] = $c;
      }
    }
  }
  return $cols;
}

/**
 * Column on t_report_member that stores the volunteer’s t_member.PersonID (or equivalent).
 *
 * PWV uses PersonID for roster members (same as t_member.PersonID). Prefer PersonID when the column
 * exists. If your table also has MemberPersonID used as a per-row surrogate (COUNT(DISTINCT …) equals
 * roster row count, not headcount), set t_report_member_person_column in config.secret.php to PersonID
 * explicitly—or to MemberPersonID only when that column holds the real member id and PersonID does not.
 */
function reportMemberPersonIdColumn(PDO $db): string {
  static $resolved = false;
  static $col = 'PersonID';
  if ($resolved) {
    return $col;
  }
  $resolved = true;
  $secrets = getSecrets();
  if (!empty($secrets['t_report_member_person_column']) && is_string($secrets['t_report_member_person_column'])) {
    $c = $secrets['t_report_member_person_column'];
    if (preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $c) && tableHasColumn($db, 't_report_member', $c)) {
      $col = $c;
      return $col;
    }
  }
  foreach (['PersonID', 'MemberPersonID', 'VolunteerPersonID', 'MemberID'] as $c) {
    if (tableHasColumn($db, 't_report_member', $c)) {
      $col = $c;
      return $col;
    }
  }
  error_log(
    'reportMemberPersonIdColumn: t_report_member has none of PersonID/MemberPersonID/VolunteerPersonID/MemberID; ' .
    'using PersonID. Set t_report_member_person_column in config.secret.php if SQL then fails.'
  );
  return 'PersonID';
}

/** True when roster has both PersonID (headcount) and MemberPersonID (often row surrogate). */
function reportMemberHasDualPersonColumns(PDO $db): bool {
  return tableHasColumn($db, 't_report_member', 'PersonID')
    && tableHasColumn($db, 't_report_member', 'MemberPersonID');
}

/** Number of bound params for one roster-membership check (1 or 2 for dual PersonID/MemberPersonID). */
function reportMemberRosterBindCount(PDO $db): int {
  return reportMemberHasDualPersonColumns($db) ? 2 : 1;
}

/** One block of params for a single roster EXISTS (duplicate personId when dual columns). */
function reportMemberRosterParamBlock(PDO $db, int $personId): array {
  return reportMemberRosterBindCount($db) === 2 ? [$personId, $personId] : [$personId];
}

/**
 * EXISTS: member appears on this report’s roster. When both PersonID and MemberPersonID exist, match either
 * (IDs may live in one column only depending on import).
 */
function reportMemberOnRosterExistsSql(PDO $db, string $alias): string {
  if (reportMemberHasDualPersonColumns($db)) {
    return 'EXISTS (SELECT 1 FROM t_report_member ' . $alias . ' WHERE ' . $alias . '.ReportID = r.ReportID AND ('
      . '(' . $alias . '.PersonID IS NOT NULL AND ' . $alias . '.PersonID = ?) OR '
      . '(' . $alias . '.MemberPersonID IS NOT NULL AND ' . $alias . '.MemberPersonID = ?)'
      . '))';
  }
  $rmPid = reportMemberPersonIdColumn($db);
  return 'EXISTS (SELECT 1 FROM t_report_member ' . $alias . ' WHERE ' . $alias . '.ReportID = r.ReportID AND '
    . $alias . '.' . $rmPid . ' = ?)';
}

/**
 * Per-report party size for splitting trail work. Dual-column: use LEAST of the two distinct counts when both
 * positive (avoids dividing by row-level MemberPersonID cardinality); else the non-zero count.
 */
function reportMemberPartySubquerySql(PDO $db): string {
  if (reportMemberHasDualPersonColumns($db)) {
    // Do not use NULLIF(col, 0): MySQL may cast UUID/varchar IDs to 0 and collapse distinct counts or error in strict mode.
    return '
    SELECT z.ReportID,
      CASE
        WHEN z.c_pid > 0 AND z.c_mid > 0 THEN LEAST(z.c_pid, z.c_mid)
        ELSE GREATEST(z.c_pid, z.c_mid)
      END AS party_n
    FROM (
      SELECT rm.ReportID,
        COUNT(DISTINCT CASE WHEN rm.PersonID IS NOT NULL THEN rm.PersonID END) AS c_pid,
        COUNT(DISTINCT CASE WHEN rm.MemberPersonID IS NOT NULL THEN rm.MemberPersonID END) AS c_mid
      FROM t_report_member rm
      GROUP BY rm.ReportID
    ) z
    ';
  }
  $rmPid = reportMemberPersonIdColumn($db);
  return '
    SELECT ReportID, COUNT(DISTINCT ' . $rmPid . ') AS party_n
    FROM t_report_member
    WHERE ' . $rmPid . ' IS NOT NULL
    GROUP BY ReportID
  ';
}

/** Rows with NULL/0 TrailClearingID are treated as tree counts (legacy / uncategorized clears). */

/** @return list<int> sorted unique positive IDs */
function trailClearingBrushIds(): array {
  static $ids = null;
  if ($ids !== null) {
    return $ids;
  }
  $secrets = getSecrets();
  if (!empty($secrets['trail_clearing_brush_ids']) && is_array($secrets['trail_clearing_brush_ids'])) {
    $out = [];
    foreach ($secrets['trail_clearing_brush_ids'] as $v) {
      $n = (int)$v;
      if ($n > 0) {
        $out[] = $n;
      }
    }
    $out = array_values(array_unique($out));
    sort($out, SORT_NUMERIC);
    if ($out !== []) {
      $ids = $out;
      return $ids;
    }
  }
  $ids = [6, 7, 8];
  return $ids;
}

function trailClearingBrushIdsSql(): string {
  return implode(', ', trailClearingBrushIds());
}

/** Tree/limb work: not a brushing-feet line. Matches patrol subquery + KPI + charts. */
function trailClearingTreeRowsFilterSql(): string {
  $brush = trailClearingBrushIdsSql();
  return '(tc.TrailClearingID IS NULL OR tc.TrailClearingID NOT IN (' . $brush . '))';
}

/** Quantity column: tree count for IDs 1–5, feet for 6–8. */
function trailClearingQtyColumn(PDO $db): string {
  static $resolved = false;
  static $col = 'NumCleared';
  if ($resolved) {
    return $col;
  }
  $resolved = true;
  $secrets = getSecrets();
  if (!empty($secrets['t_trail_clearing_qty_column']) && is_string($secrets['t_trail_clearing_qty_column'])) {
    $c = $secrets['t_trail_clearing_qty_column'];
    if (preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $c) && tableHasColumn($db, TREES_CLEARED_TABLE, $c)) {
      $col = $c;
      return $col;
    }
  }
  foreach (['NumCleared', 'Qty', 'Quantity'] as $c) {
    if (tableHasColumn($db, TREES_CLEARED_TABLE, $c)) {
      $col = $c;
      return $col;
    }
  }
  return $col;
}

/** SQL: quantity with tc alias. */
function trailClearingQtyExpr(PDO $db): string {
  return 'COALESCE(tc.' . trailClearingQtyColumn($db) . ', 0)';
}

/**
 * Chart buckets: TrailClearingID 1–5 ↔ inch-class labels (lu order: small → XXL).
 * Last bucket: NULL / 0 / unknown ID (still tree work, not brushing IDs).
 *
 * @return list<array{sizeClass: string, label: string, clearingId: int|null}>
 */
function treesClearedTreeBuckets(): array {
  return [
    ['sizeClass' => '< 8"',      'label' => "Small\n(< 8\")",    'clearingId' => 1],
    ['sizeClass' => '8" – 15"',  'label' => "Medium\n(8–15\")",  'clearingId' => 2],
    ['sizeClass' => '16" – 23"', 'label' => "Large\n(16–23\")",  'clearingId' => 3],
    ['sizeClass' => '24" – 36"', 'label' => "XL\n(24–36\")",     'clearingId' => 4],
    ['sizeClass' => '> 36"',     'label' => "XXL\n(> 36\")",     'clearingId' => 5],
    ['sizeClass' => 'Other',      'label' => "Other\n(unsized)",  'clearingId' => null],
  ];
}

/**
 * @param string $qtyExpr SQL expression for quantity (e.g. tc.qty or x.numCleared * x.w)
 * @param string $idPrefix Table alias + dot (e.g. 'tc.' or 'x.')
 */
function treesClearedBucketSumCaseSql(string $qtyExpr, string $idPrefix, int $i, ?int $clearingId): string {
  if ($clearingId !== null) {
    $cid = (int)$clearingId;
    return "SUM(CASE WHEN {$idPrefix}TrailClearingID = $cid THEN $qtyExpr ELSE 0 END) AS s$i";
  }
  $lo = TRAIL_CLEARING_TREE_ID_MIN;
  $hi = TRAIL_CLEARING_TREE_ID_MAX;
  return "SUM(CASE WHEN {$idPrefix}TrailClearingID IS NULL OR {$idPrefix}TrailClearingID NOT BETWEEN $lo AND $hi THEN $qtyExpr ELSE 0 END) AS s$i";
}

/**
 * Member-scoped chart buckets: same rules as treesClearedBucketSumCaseSql, applied per weighted clearing row in PHP.
 * Rows must be numeric-indexed from PDO::FETCH_NUM: [0] = TrailClearingID, [1] = numCleared, [2] = share weight w.
 * (Some drivers return odd associative keys for aliased columns; numeric order matches SELECT list exactly.)
 *
 * @param list<array<int, mixed>> $rows
 * @param list<array{sizeClass: string, label: string, clearingId: int|null}> $buckets
 * @return list<float>
 */
function treesClearedMemberBucketSumsFromRows(array $rows, array $buckets): array {
  $n = count($buckets);
  $sums = array_fill(0, $n, 0.0);
  $lo = TRAIL_CLEARING_TREE_ID_MIN;
  $hi = TRAIL_CLEARING_TREE_ID_MAX;
  foreach ($rows as $row) {
    if (!is_array($row) || !array_key_exists(2, $row)) {
      continue;
    }
    $tidRaw = $row[0];
    $q = (float)$row[1];
    $w = (float)$row[2];
    if (abs($q) < 1e-12) {
      continue;
    }
    $contrib = $q * $w;
    $tidStr = is_string($tidRaw) ? trim($tidRaw) : $tidRaw;
    $placed = false;
    foreach ($buckets as $i => $b) {
      $cid = $b['clearingId'];
      if ($cid === null) {
        continue;
      }
      if ($tidStr !== null && $tidStr !== '') {
        if ((int)$tidStr === (int)$cid) {
          $sums[$i] += $contrib;
          $placed = true;
          break;
        }
      }
    }
    if ($placed) {
      continue;
    }
    $tint = ($tidStr === null || $tidStr === '') ? null : (int)$tidStr;
    if ($tint === null || $tint === 0 || $tint < $lo || $tint > $hi) {
      $sums[$n - 1] += $contrib;
    }
  }
  return $sums;
}

/**
 * Optional t_rpt_trail_clearing column = PersonID for who logged the clearing row.
 * Secrets: t_trail_clearing_person_column, or legacy t_tree_down_person_column (same purpose).
 */
function detectTrailClearingPersonColumn(PDO $db): ?string {
  static $resolved = false;
  static $col = null;
  if ($resolved) {
    return $col;
  }
  $resolved = true;
  $secrets = getSecrets();
  if (array_key_exists('t_trail_clearing_person_column', $secrets) && $secrets['t_trail_clearing_person_column'] === false) {
    return null;
  }
  $secretKeys = ['t_trail_clearing_person_column', 't_tree_down_person_column'];
  foreach ($secretKeys as $sk) {
    if (!empty($secrets[$sk]) && is_string($secrets[$sk])) {
      $c = $secrets[$sk];
      if (preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $c) && tableHasColumn($db, TREES_CLEARED_TABLE, $c)) {
        $col = $c;
        return $col;
      }
    }
  }
  $candidates = [
    'PersonID',
    'MemberPersonID',
    'ClearedByPersonID',
    'LoggedByPersonID',
    'ReporterPersonID',
  ];
  try {
    $stmt = $db->query('SHOW COLUMNS FROM `' . TREES_CLEARED_TABLE . '`');
    $fields = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
      $fields[$row['Field']] = true;
    }
    foreach ($candidates as $c) {
      if (!empty($fields[$c])) {
        $col = $c;
        return $col;
      }
    }
  } catch (Throwable $e) {
    /* probe below */
  }
  foreach ($candidates as $c) {
    if (tableHasColumn($db, TREES_CLEARED_TABLE, $c)) {
      $col = $c;
      return $col;
    }
  }
  return null;
}

/** Member scoped to patrol roster and/or any detected PersonID column on t_report (OR all that exist). */
function memberReportClause(PDO $db, int $personId): array {
  $optCols = detectReportPersonColumns($db);
  $base = reportMemberOnRosterExistsSql($db, 'rmf');
  $rb = reportMemberRosterParamBlock($db, $personId);
  if ($optCols === []) {
    return [$base, $rb];
  }
  $parts = [$base];
  $params = $rb;
  foreach ($optCols as $c) {
    $parts[] = '(r.' . $c . ' IS NOT NULL AND r.' . $c . ' = ?)';
    $params[] = $personId;
  }
  return ['(' . implode(' OR ', $parts) . ')', $params];
}

/**
 * Broader scope for trail-clearing rows: roster OR report writer OR per-row person column (when present).
 */
function memberTreesClause(PDO $db, int $personId): array {
  [$frag, $params] = memberReportClause($db, $personId);
  $tcCol = detectTrailClearingPersonColumn($db);
  if ($tcCol === null) {
    return [$frag, $params];
  }
  return [
    '(' . $frag . ' OR (tc.' . $tcCol . ' IS NOT NULL AND tc.' . $tcCol . ' = ?))',
    array_merge($params, [$personId]),
  ];
}

function scopeWhereBase(?string $s, ?string $e): array {
  $w = ['r.GroupID = ' . PWV_GROUP,
        '(r.IsDraft IS NULL OR r.IsDraft = 0)',
        '(r.IsUnofficial IS NULL OR r.IsUnofficial = 0)'];
  $p = [];
  if ($s) { $w[] = 'r.ActivityDate >= ?'; $p[] = $s; }
  if ($e) { $w[] = 'r.ActivityDate <= ?'; $p[] = $e; }
  return [$w, $p];
}

// Build WHERE clause parts + params array for t_report aliased as 'r'
function scopeWhere(PDO $db, ?string $s, ?string $e, $memberCtx): array {
  [$w, $p] = scopeWhereBase($s, $e);
  if ($memberCtx !== 'all') {
    [$frag, $mp] = memberReportClause($db, (int)$memberCtx);
    $w[] = $frag;
    $p = array_merge($p, $mp);
  }
  return [implode(' AND ', $w), $p];
}

/** Same as scopeWhere but member filter also matches t_rpt_trail_clearing person column when defined. */
function scopeWhereTrees(PDO $db, ?string $s, ?string $e, $memberCtx): array {
  [$w, $p] = scopeWhereBase($s, $e);
  if ($memberCtx !== 'all') {
    [$frag, $mp] = memberTreesClause($db, (int)$memberCtx);
    $w[] = $frag;
    $p = array_merge($p, $mp);
  }
  return [implode(' AND ', $w), $p];
}

/**
 * @return array{0: string, 1: int} [writer OR sql or '0', number of ? per occurrence]
 */
function treesClearedWriterMatchSql(PDO $db): array {
  $cols = detectReportPersonColumns($db);
  if ($cols === []) {
    return ['0', 0];
  }
  $parts = [];
  foreach ($cols as $c) {
    $parts[] = '(r.' . $c . ' IS NOT NULL AND r.' . $c . ' = ?)';
  }
  return ['(' . implode(' OR ', $parts) . ')', count($cols)];
}

/**
 * Bind order for treesClearedMember* SQL (placeholders top-to-bottom):
 *   roster×k, writer×nw, pBase (scope dates), roster×k, writer×nw
 * where k = reportMemberRosterBindCount (1 or 2 for dual PersonID/MemberPersonID).
 *
 * @param list<float|int|string|null> $pBase
 * @return list<float|int|string|null>
 */
function treesClearedMemberBindParams(PDO $db, int $personId, int $nw, array $pBase): array {
  $writerBlock = $nw > 0 ? array_fill(0, $nw, $personId) : [];
  $rb = reportMemberRosterParamBlock($db, $personId);
  return array_merge($rb, $writerBlock, $pBase, $rb, $writerBlock);
}

/**
 * Member-scoped trees cleared: per report, sum tree-line qty on t_rpt_trail_clearing, divide by distinct
 * roster size, credit that share to each roster member (EXISTS — no join duplication). No roster:
 * full report total to filer when filing columns match.
 */
function treesClearedMemberTotal(PDO $db, ?string $s, ?string $e, int $personId): float {
  try {
    return treesClearedMemberTotalQuery($db, $s, $e, $personId);
  } catch (Throwable $e) {
    error_log('treesClearedMemberTotal: ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
    return 0.0;
  }
}

function treesClearedMemberTotalQuery(PDO $db, ?string $s, ?string $e, int $personId): float {
  [$w, $pBase] = scopeWhereBase($s, $e);
  $wExpr = implode(' AND ', $w);
  [$writerSql, $nw] = treesClearedWriterMatchSql($db);
  $tcf = treesClearedTableRef();
  $rowF = trailClearingTreeRowsFilterSql();
  $qty = trailClearingQtyExpr($db);
  $onRoster = reportMemberOnRosterExistsSql($db, 'rm_e');
  $partySql = reportMemberPartySubquerySql($db);

  $sql = "
SELECT COALESCE(SUM(
  CASE
    WHEN COALESCE(party.party_n, 0) > 0 AND $onRoster THEN rt.tree_qty / NULLIF(party.party_n, 0)
    WHEN COALESCE(party.party_n, 0) = 0 AND ($writerSql) THEN rt.tree_qty
    ELSE 0.0
  END
), 0) AS n
FROM (
  SELECT tc.ReportID, SUM($qty) AS tree_qty
  FROM $tcf tc
  WHERE ($rowF)
  GROUP BY tc.ReportID
) rt
JOIN t_report r ON r.ReportID = rt.ReportID
LEFT JOIN ($partySql) party ON party.ReportID = r.ReportID
WHERE $wExpr
AND (
  (COALESCE(party.party_n, 0) > 0 AND $onRoster)
  OR (COALESCE(party.party_n, 0) = 0 AND ($writerSql))
)
";
  $stmt = $db->prepare($sql);
  $stmt->execute(treesClearedMemberBindParams($db, $personId, $nw, $pBase));
  return (float)$stmt->fetchColumn();
}

/**
 * @return array{aggregate: list<array{sizeClass: string, label: string, count: float}>, byTrail: list<array{trailName: string, trailNumber: string, trees: list<array{sizeClass: string, count: float}>, total: float}>}
 */
function treesClearedMemberScoped(PDO $db, ?string $s, ?string $e, int $personId): array {
  return treesClearedMemberScopedQuery($db, $s, $e, $personId);
}

function treesClearedMemberScopedQuery(PDO $db, ?string $s, ?string $e, int $personId): array {
  [$w, $pBase] = scopeWhereBase($s, $e);
  $wExpr = implode(' AND ', $w);
  [$writerSql, $nw] = treesClearedWriterMatchSql($db);
  $bindParams = treesClearedMemberBindParams($db, $personId, $nw, $pBase);
  $rowF = trailClearingTreeRowsFilterSql();
  $tcf = treesClearedTableRef();
  $buckets = treesClearedTreeBuckets();
  $qtyCol = trailClearingQtyColumn($db);
  $innerQty = 'COALESCE(tc.' . $qtyCol . ', 0)';
  $onRoster = reportMemberOnRosterExistsSql($db, 'rm_e');
  $partySql = reportMemberPartySubquerySql($db);

  $weightCase = "
    CASE
      WHEN COALESCE(party.party_n, 0) > 0 AND $onRoster THEN 1.0 / NULLIF(party.party_n, 0)
      WHEN COALESCE(party.party_n, 0) = 0 AND ($writerSql) THEN 1.0
      ELSE 0.0
    END
  ";

  $innerWeightedSql = "
SELECT tc.TrailClearingID, $innerQty AS numCleared, $weightCase AS w
FROM $tcf tc
JOIN t_report r ON r.ReportID = tc.ReportID
LEFT JOIN ($partySql) party ON party.ReportID = r.ReportID
WHERE $wExpr AND ($rowF)
AND (
  (COALESCE(party.party_n, 0) > 0 AND $onRoster)
  OR (COALESCE(party.party_n, 0) = 0 AND ($writerSql))
)
";
  $innerStmt = $db->prepare($innerWeightedSql);
  $innerStmt->execute($bindParams);
  $weightedRows = $innerStmt->fetchAll(PDO::FETCH_NUM);
  $bucketSums = treesClearedMemberBucketSumsFromRows($weightedRows, $buckets);
  $bucketTotal = array_sum($bucketSums);
  if ($bucketTotal < 1e-9 && $weightedRows !== []) {
    error_log(
      'treesClearedMemberScoped: ' . count($weightedRows)
      . ' weighted clearing rows but bucket sums ~0 (check TrailClearingID / qty / w columns).'
    );
  }

  $aggregate = [];
  foreach ($buckets as $i => $b) {
    $aggregate[] = [
      'sizeClass' => $b['sizeClass'],
      'label'     => $b['label'],
      'count'     => round((float)($bucketSums[$i] ?? 0), 2),
    ];
  }

  $trailParts = [];
  foreach ($buckets as $i => $b) {
    $trailParts[] = treesClearedBucketSumCaseSql('x.numCleared * x.w', 'x.', $i, $b['clearingId']);
  }
  $trailSelect = implode(', ', $trailParts);

  $byTrailSql = "
SELECT x.TrailID, x.TrailName, x.TrailNumber,
       $trailSelect,
       SUM(x.numCleared * x.w) AS total
FROM (
  SELECT tc.TrailClearingID, $innerQty AS numCleared, t.TrailID, t.TrailName, t.TrailNumber, $weightCase AS w
  FROM $tcf tc
  JOIN t_report r ON r.ReportID = tc.ReportID
  JOIN lu_wksite_trail wt ON wt.WksiteID = r.WksiteID
  JOIN lu_trail t ON t.TrailID = wt.TrailID
  LEFT JOIN ($partySql) party ON party.ReportID = r.ReportID
  WHERE $wExpr AND ($rowF)
  AND (
    (COALESCE(party.party_n, 0) > 0 AND $onRoster)
    OR (COALESCE(party.party_n, 0) = 0 AND ($writerSql))
  )
) x
GROUP BY x.TrailID, x.TrailName, x.TrailNumber
HAVING SUM(x.numCleared * x.w) > 0
ORDER BY total DESC
";
  $byTrail = [];
  try {
    $byTrailStmt = $db->prepare($byTrailSql);
    $byTrailStmt->execute($bindParams);
    foreach ($byTrailStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
      $trees = [];
      foreach ($buckets as $i => $b) {
        $sk = 's' . $i;
        $tv = $row[$sk] ?? $row[strtoupper($sk)] ?? 0;
        $trees[] = [
          'sizeClass' => $b['sizeClass'],
          'count'     => round((float)$tv, 2),
        ];
      }
      $byTrail[] = [
        'trailName'   => $row['TrailName'],
        'trailNumber' => $row['TrailNumber'] ?? '',
        'trees'       => $trees,
        'total'       => round((float)($row['total'] ?? 0), 2),
      ];
    }
  } catch (Throwable $e) {
    error_log(
      'treesClearedMemberScoped byTrail query: ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine()
    );
  }

  return ['aggregate' => $aggregate, 'byTrail' => $byTrail];
}

function summary(PDO $db, ?string $s, ?string $e, $ctx): array {
  [$w, $p] = scopeWhere($db, $s, $e, $ctx);
  $rmPid = reportMemberPersonIdColumn($db);

  $row = $db->prepare("
    SELECT
      COUNT(DISTINCT r.ReportID) AS patrols,
      COUNT(DISTINCT wt.TrailID) AS trailsCovered,
      COUNT(DISTINCT rm.$rmPid) AS totalActiveMembers,
      ROUND(SUM(
        CASE WHEN r.TimeStarted IS NOT NULL AND r.TimeEnded IS NOT NULL
             THEN TIMESTAMPDIFF(MINUTE, r.TimeStarted, r.TimeEnded) / 60.0
             ELSE 0 END
      ), 1) AS volunteerHours
    FROM t_report r
    JOIN lu_wksite_trail wt ON wt.WksiteID = r.WksiteID
    LEFT JOIN t_report_member rm ON rm.ReportID = r.ReportID
    WHERE $w
  ");
  $row->execute($p);
  $d = $row->fetch(PDO::FETCH_ASSOC);

  // trees cleared: all t_rpt_trail_clearing rows except brushing IDs (feet); includes NULL/unsized IDs
  if ($ctx === 'all') {
    [$w2, $p2] = scopeWhereTrees($db, $s, $e, $ctx);
    $rowF = trailClearingTreeRowsFilterSql();
    $tcf = treesClearedTableRef();
    $qty = trailClearingQtyExpr($db);
    $trees = $db->prepare("
      SELECT COALESCE(SUM($qty), 0) AS n
      FROM $tcf tc
      JOIN t_report r ON r.ReportID = tc.ReportID
      WHERE $w2 AND ($rowF)
    ");
    $trees->execute($p2);
    $tc = round((float)$trees->fetchColumn(), 2);
  } else {
    $tc = round(treesClearedMemberTotal($db, $s, $e, (int)$ctx), 2);
  }

  return [
    'patrols'            => (int)$d['patrols'],
    'trailsCovered'      => (int)$d['trailsCovered'],
    'totalActiveMembers' => (int)$d['totalActiveMembers'],
    'volunteerHours'     => (float)($d['volunteerHours'] ?? 0),
    'treesCleared'       => $tc,
  ];
}

/** Sum hikersSeen from trailCoverage rows (matches Trail Coverage "Seen" column total). */
function sumTrailHikersSeen(array $rows): int {
  $s = 0;
  foreach ($rows as $r) {
    $s += (int)($r['hikersSeen'] ?? 0);
  }
  return $s;
}

function patrolActivity(PDO $db, ?string $s, ?string $e, $ctx, string $range): array {
  [$w, $p] = scopeWhere($db, $s, $e, $ctx);

  if ($range === '7d') {
    // Daily — fill gaps
    $stmt = $db->prepare("
      SELECT DATE_FORMAT(r.ActivityDate,'%Y-%m-%d') AS d, COUNT(DISTINCT r.ReportID) AS n
      FROM t_report r WHERE $w GROUP BY d ORDER BY d
    ");
    $stmt->execute($p);
    $byDate = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) $byDate[$row['d']] = (int)$row['n'];

    $result = [];
    for ($i = 6; $i >= 0; $i--) {
      $date = date('Y-m-d', strtotime("-$i days"));
      $result[] = [
        'date'     => $date,
        'dayLabel' => date('D', strtotime($date)), // Mon, Tue …
        'patrols'  => $byDate[$date] ?? 0,
      ];
    }
    return $result;
  }

  if ($range === '1y' || $range === '3m') {
    // Monthly
    $stmt = $db->prepare("
      SELECT DATE_FORMAT(r.ActivityDate,'%Y-%m') AS m, COUNT(DISTINCT r.ReportID) AS n
      FROM t_report r WHERE $w GROUP BY m ORDER BY m
    ");
    $stmt->execute($p);
    $byMonth = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) $byMonth[$row['m']] = (int)$row['n'];

    // Generate months from start to today
    $result = [];
    $cur = new DateTime($s ?? '2000-01-01');
    $last = new DateTime($e ?? date('Y-m-d'));
    while ($cur <= $last) {
      $key = $cur->format('Y-m');
      $result[] = [
        'date'     => $cur->format('Y-m-01'),
        'dayLabel' => $cur->format('M'),
        'patrols'  => $byMonth[$key] ?? 0,
      ];
      $cur->modify('+1 month');
    }
    return $result;
  }

  if ($range === '1m') {
    // Weekly
    $stmt = $db->prepare("
      SELECT YEARWEEK(r.ActivityDate,1) AS wk, MIN(r.ActivityDate) AS wstart, COUNT(DISTINCT r.ReportID) AS n
      FROM t_report r WHERE $w GROUP BY wk ORDER BY wk
    ");
    $stmt->execute($p);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $result = [];
    foreach ($rows as $row) {
      $result[] = [
        'date'     => $row['wstart'],
        'dayLabel' => date('M j', strtotime($row['wstart'])),
        'patrols'  => (int)$row['n'],
      ];
    }
    return $result ?: [['date' => $s ?? date('Y-m-d'), 'dayLabel' => '', 'patrols' => 0]];
  }

  // All time — yearly
  $stmt = $db->prepare("
    SELECT YEAR(r.ActivityDate) AS yr, COUNT(DISTINCT r.ReportID) AS n
    FROM t_report r WHERE $w GROUP BY yr ORDER BY yr
  ");
  $stmt->execute($p);
  $result = [];
  foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $result[] = ['date' => $row['yr'] . '-01-01', 'dayLabel' => (string)$row['yr'], 'patrols' => (int)$row['n']];
  }
  return $result ?: [['date' => date('Y-m-d'), 'dayLabel' => date('Y'), 'patrols' => 0]];
}

function trailCoverage(PDO $db, ?string $s, ?string $e, $ctx): array {
  [$w, $p] = scopeWhere($db, $s, $e, $ctx);
  $rmPid = reportMemberPersonIdColumn($db);

  // Patrol stats per trail
  $stmt = $db->prepare("
    SELECT
      wt.TrailID,
      COUNT(DISTINCT r.ReportID) AS patrols,
      COUNT(DISTINCT rm.$rmPid) AS members,
      COALESCE(SUM(r.NumContacted), 0) AS hikersContacted,
      MAX(r.ActivityDate) AS lastPatrolDate
    FROM t_report r
    JOIN lu_wksite_trail wt ON wt.WksiteID = r.WksiteID
    LEFT JOIN t_report_member rm ON rm.ReportID = r.ReportID
    WHERE $w
    GROUP BY wt.TrailID
    HAVING patrols > 0
  ");
  $stmt->execute($p);
  $stats = [];
  foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $stats[(int)$row['TrailID']] = $row;
  }

  if (empty($stats)) return [];
  $ids = implode(',', array_keys($stats));

  // Hikers seen per trail (via observation table)
  [$w2, $p2] = scopeWhere($db, $s, $e, $ctx);
  $seenStmt = $db->prepare("
    SELECT wt.TrailID, COALESCE(SUM(o.NumSeen), 0) AS hikersSeen
    FROM t_rpt_observation o
    JOIN lu_obs_type ot ON ot.ObsTypeID = o.ObsTypeID AND ot.CanContact = 1
    JOIN t_report r ON r.ReportID = o.ReportID
    JOIN lu_wksite_trail wt ON wt.WksiteID = r.WksiteID
    WHERE $w2 AND wt.TrailID IN ($ids)
    GROUP BY wt.TrailID
  ");
  $seenStmt->execute($p2);
  $seen = [];
  foreach ($seenStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $seen[(int)$row['TrailID']] = (int)$row['hikersSeen'];
  }

  // Trail metadata
  $trailStmt = $db->prepare("
    SELECT t.TrailID, t.TrailName, t.TrailNumber, COALESCE(t.Length, 0) AS Length, t.InWilderness,
           a.AreaName
    FROM lu_trail t
    LEFT JOIN lu_wksite_trail wt ON wt.TrailID = t.TrailID
    LEFT JOIN lu_wksite_area wa ON wa.WksiteID = wt.WksiteID
    LEFT JOIN lu_area a ON a.AreaID = wa.AreaID
    WHERE t.TrailID IN ($ids)
    GROUP BY t.TrailID, t.TrailName, t.TrailNumber, t.Length, t.InWilderness, a.AreaName
  ");
  $trailStmt->execute();
  $trails = [];
  foreach ($trailStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $tid = (int)$row['TrailID'];
    if (!isset($trails[$tid])) $trails[$tid] = $row;
  }

  $result = [];
  foreach ($stats as $tid => $s2) {
    $t = $trails[$tid] ?? null;
    if (!$t) continue;
    $result[] = [
      'trailId'        => $tid,
      'trailName'      => $t['TrailName'],
      'trailNumber'    => $t['TrailNumber'] ?? '',
      'area'           => $t['AreaName'] ?? '',
      'lengthMiles'    => (float)$t['Length'],
      'inWilderness'   => (bool)$t['InWilderness'],
      'patrols'        => (int)$s2['patrols'],
      'members'        => (int)$s2['members'],
      'hikersSeen'     => $seen[$tid] ?? 0,
      'hikersContacted'=> (int)$s2['hikersContacted'],
      'lastPatrolDate' => $s2['lastPatrolDate'],
    ];
  }

  usort($result, fn($a, $b) => $b['patrols'] - $a['patrols'] ?: strcmp($a['trailName'], $b['trailName']));
  return $result;
}

function patrolsByTrail(PDO $db, ?string $s, ?string $e, $ctx): array {
  [$w, $p] = scopeWhere($db, $s, $e, $ctx);
  $rmPid = reportMemberPersonIdColumn($db);
  $tcf = treesClearedTableRef();
  $qtySub = 'COALESCE(tc.' . trailClearingQtyColumn($db) . ', 0)';
  $treeRowFilter = trailClearingTreeRowsFilterSql();

  $stmt = $db->prepare("
    SELECT
      wt.TrailID,
      r.ReportID,
      DATE_FORMAT(r.ActivityDate,'%Y-%m-%d') AS date,
      COALESCE(GROUP_CONCAT(DISTINCT CONCAT(m.FirstName,' ',m.LastName)
               ORDER BY m.LastName SEPARATOR ' & '), 'Unknown') AS memberName,
      COALESCE(obs.hikersSeen, 0) AS hikersSeen,
      COALESCE(r.NumContacted, 0) AS hikersContacted,
      (
        SELECT COALESCE(SUM($qtySub), 0)
        FROM $tcf tc
        WHERE tc.ReportID = r.ReportID AND ($treeRowFilter)
      ) AS treesCleared
    FROM t_report r
    JOIN lu_wksite_trail wt ON wt.WksiteID = r.WksiteID
    LEFT JOIN t_report_member rm ON rm.ReportID = r.ReportID
    LEFT JOIN t_member m ON m.PersonID = rm.$rmPid
    LEFT JOIN (
      SELECT o.ReportID, SUM(o.NumSeen) AS hikersSeen
      FROM t_rpt_observation o
      JOIN lu_obs_type ot ON ot.ObsTypeID = o.ObsTypeID AND ot.CanContact = 1
      GROUP BY o.ReportID
    ) obs ON obs.ReportID = r.ReportID
    WHERE $w
    GROUP BY wt.TrailID, r.ReportID, r.ActivityDate, r.NumContacted, obs.hikersSeen
    ORDER BY wt.TrailID, r.ActivityDate DESC
  ");
  $stmt->execute($p);

  $result = [];
  foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $tid = (int)$row['TrailID'];
    if (!isset($result[$tid])) $result[$tid] = [];
    $result[$tid][] = [
      'date'            => $row['date'],
      'memberName'      => $row['memberName'],
      'hikersSeen'      => (int)$row['hikersSeen'],
      'hikersContacted' => (int)$row['hikersContacted'],
      'treesCleared'    => round((float)($row['treesCleared'] ?? 0), 2),
    ];
  }
  return $result;
}

function violations(PDO $db, ?string $s, ?string $e, $ctx): array {
  [$w, $p] = scopeWhere($db, $s, $e, $ctx);
  $stmt = $db->prepare("
    SELECT vt.ViolTypeName AS category, SUM(rv.NumSeen) AS cnt
    FROM t_rpt_violation rv
    JOIN lu_viol_type vt ON vt.ViolTypeID = rv.ViolTypeID
    JOIN t_report r ON r.ReportID = rv.ReportID
    WHERE $w
    GROUP BY vt.ViolTypeID, vt.ViolTypeName
    HAVING cnt > 0
    ORDER BY cnt DESC
  ");
  $stmt->execute($p);
  $result = [];
  foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $cat = (string)$row['category'];
    // Omit littering-along-trail variants from dashboard (e.g. "…Trail or in Campsite")
    $catNorm = strtolower(trim($cat));
    if (stripos($catNorm, 'littering along trail') !== false) {
      continue;
    }
    $result[] = ['category' => $cat, 'count' => (int)$row['cnt'], 'color' => 'amber'];
  }
  return $result;
}

/** Shape matches treesCleared() — used when tree SQL fails so the dashboard JSON still returns 200. */
function treesClearedSafeEmpty(): array {
  $aggregate = [];
  foreach (treesClearedTreeBuckets() as $b) {
    $aggregate[] = [
      'sizeClass' => $b['sizeClass'],
      'label'     => $b['label'],
      'count'     => 0.0,
    ];
  }
  return ['aggregate' => $aggregate, 'byTrail' => []];
}

function treesCleared(PDO $db, ?string $s, ?string $e, $ctx): array {
  $buckets = treesClearedTreeBuckets();
  $rowF = trailClearingTreeRowsFilterSql();
  $tcf = treesClearedTableRef();
  $qty = trailClearingQtyExpr($db);

  if ($ctx !== 'all') {
    return treesClearedMemberScoped($db, $s, $e, (int)$ctx);
  }

  $caseCols = [];
  foreach ($buckets as $i => $b) {
    $caseCols[] = treesClearedBucketSumCaseSql($qty, 'tc.', $i, $b['clearingId']);
  }
  $selectCols = implode(', ', $caseCols);

  [$w, $p] = scopeWhereTrees($db, $s, $e, $ctx);
  $stmt = $db->prepare("
    SELECT $selectCols
    FROM $tcf tc
    JOIN t_report r ON r.ReportID = tc.ReportID
    WHERE $w AND ($rowF)
  ");
  $stmt->execute($p);
  $aggRow = $stmt->fetch(PDO::FETCH_ASSOC);

  $aggregate = [];
  foreach ($buckets as $i => $b) {
    $aggregate[] = ['sizeClass' => $b['sizeClass'], 'label' => $b['label'], 'count' => round((float)($aggRow["s$i"] ?? 0), 2)];
  }

  $trailSumParts = [];
  foreach ($buckets as $i => $b) {
    $trailSumParts[] = treesClearedBucketSumCaseSql($qty, 'tc.', $i, $b['clearingId']);
  }
  $trailSumSql = implode(",\n           ", $trailSumParts);

  [$w2, $p2] = scopeWhereTrees($db, $s, $e, $ctx);
  $byTrailStmt = $db->prepare("
    SELECT t.TrailName, t.TrailNumber,
           $trailSumSql,
           SUM($qty) AS total
    FROM $tcf tc
    JOIN t_report r ON r.ReportID = tc.ReportID
    JOIN lu_wksite_trail wt ON wt.WksiteID = r.WksiteID
    JOIN lu_trail t ON t.TrailID = wt.TrailID
    WHERE $w2 AND ($rowF)
    GROUP BY t.TrailID, t.TrailName, t.TrailNumber
    ORDER BY total DESC
  ");
  $byTrailStmt->execute($p2);

  $byTrail = [];
  foreach ($byTrailStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $trees = [];
    foreach ($buckets as $i => $b) {
      $trees[] = ['sizeClass' => $b['sizeClass'], 'count' => round((float)($row["s$i"] ?? 0), 2)];
    }
    $byTrail[] = [
      'trailName'   => $row['TrailName'],
      'trailNumber' => $row['TrailNumber'] ?? '',
      'trees'       => $trees,
      'total'       => round((float)($row['total'] ?? 0), 2),
    ];
  }

  return ['aggregate' => $aggregate, 'byTrail' => $byTrail];
}

function membersByAge(PDO $db, ?string $s, ?string $e): array {
  $rmPid = reportMemberPersonIdColumn($db);
  $activeWhere = "r.GroupID = " . PWV_GROUP . "
    AND (r.IsDraft IS NULL OR r.IsDraft = 0)
    AND (r.IsUnofficial IS NULL OR r.IsUnofficial = 0)";
  $activeParams = [];
  if ($s) { $activeWhere .= " AND r.ActivityDate >= ?"; $activeParams[] = $s; }
  if ($e) { $activeWhere .= " AND r.ActivityDate <= ?"; $activeParams[] = $e; }

  $stmt = $db->prepare("
    SELECT
      CASE
        WHEN YEAR(CURDATE()) - m.BirthYear < 30 THEN '20–29'
        WHEN YEAR(CURDATE()) - m.BirthYear < 40 THEN '30–39'
        WHEN YEAR(CURDATE()) - m.BirthYear < 50 THEN '40–49'
        WHEN YEAR(CURDATE()) - m.BirthYear < 60 THEN '50–59'
        WHEN YEAR(CURDATE()) - m.BirthYear < 70 THEN '60–69'
        WHEN YEAR(CURDATE()) - m.BirthYear < 80 THEN '70–79'
        ELSE '80+'
      END AS ageGroup,
      SUM(CASE WHEN active.PersonID IS NOT NULL THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN active.PersonID IS NULL THEN 1 ELSE 0 END) AS inactive
    FROM t_member m
    JOIN t_mem_group mg ON mg.PersonID = m.PersonID AND mg.GroupID = " . PWV_GROUP . "
    LEFT JOIN (
      SELECT DISTINCT rm.$rmPid AS PersonID
      FROM t_report_member rm
      JOIN t_report r ON r.ReportID = rm.ReportID
      WHERE $activeWhere
    ) active ON active.PersonID = m.PersonID
    WHERE m.BirthYear IS NOT NULL
      AND YEAR(CURDATE()) - m.BirthYear BETWEEN 20 AND 99
    GROUP BY ageGroup
    ORDER BY FIELD(ageGroup,'20–29','30–39','40–49','50–59','60–69','70–79','80+')
  ");
  $stmt->execute($activeParams);

  $result = [];
  foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $result[] = ['ageGroup' => $row['ageGroup'], 'active' => (int)$row['active'], 'inactive' => (int)$row['inactive']];
  }
  return $result;
}

function members(PDO $db): array {
  $rmPid = reportMemberPersonIdColumn($db);
  $stmt = $db->prepare("
    SELECT m.PersonID, m.FirstName, m.LastName,
           CONCAT(m.FirstName,' ',m.LastName) AS fullName,
           COUNT(DISTINCT rm.ReportID) AS patrols
    FROM t_member m
    JOIN t_mem_group mg ON mg.PersonID = m.PersonID AND mg.GroupID = " . PWV_GROUP . "
    LEFT JOIN t_report_member rm ON rm.$rmPid = m.PersonID
    LEFT JOIN t_report r ON r.ReportID = rm.ReportID AND r.GroupID = " . PWV_GROUP . "
      AND (r.IsDraft IS NULL OR r.IsDraft = 0)
    WHERE m.EmailAddress IS NOT NULL
    GROUP BY m.PersonID, m.FirstName, m.LastName
    HAVING patrols > 0
    ORDER BY patrols DESC
  ");
  $stmt->execute();

  $result = [];
  foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $result[] = [
      'personId'  => (int)$row['PersonID'],
      'firstName' => $row['FirstName'],
      'lastName'  => $row['LastName'],
      'fullName'  => $row['fullName'],
      'patrols'   => (int)$row['patrols'],
    ];
  }
  return $result;
}
