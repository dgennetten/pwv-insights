<?php
require_once __DIR__ . '/../config.php';

define('PWV_GROUP', 10);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ─── Input ────────────────────────────────────────────────────────────────────
$timeRange = $_GET['timeRange'] ?? '7d';
if (!in_array($timeRange, ['7d','1m','3m','1y','all'], true)) $timeRange = '7d';

$memberRaw = $_GET['memberContext'] ?? 'all';
$memberCtx = ($memberRaw === 'all') ? 'all' : (int)$memberRaw;

$db = getDb();

// ─── Date ranges ─────────────────────────────────────────────────────────────
[$start, $end, $prevStart, $prevEnd] = dateRange($timeRange);

// ─── Build & return ───────────────────────────────────────────────────────────
$cur  = summary($db, $start, $end, $memberCtx);
$prev = $prevStart ? summary($db, $prevStart, $prevEnd, $memberCtx) : null;

jsonOut([
  'summary'              => [
    'patrols'              => $cur['patrols'],
    'patrolsDelta'         => $prev ? $cur['patrols']         - $prev['patrols']         : 0,
    'trailsCovered'        => $cur['trailsCovered'],
    'trailsCoveredDelta'   => $prev ? $cur['trailsCovered']   - $prev['trailsCovered']   : 0,
    'treesCleared'         => $cur['treesCleared'],
    'treesClearedDelta'    => $prev ? $cur['treesCleared']    - $prev['treesCleared']    : 0,
    'hikersContacted'      => $cur['hikersContacted'],
    'hikersContactedDelta' => $prev ? $cur['hikersContacted'] - $prev['hikersContacted'] : 0,
    'volunteerHours'       => $cur['volunteerHours'],
    'totalActiveMembers'   => $cur['totalActiveMembers'],
    'periodLabel'          => periodLabel($start, $end),
  ],
  'patrolActivity'       => patrolActivity($db, $start, $end, $memberCtx, $timeRange),
  'trailCoverage'        => trailCoverage($db, $start, $end, $memberCtx),
  'patrolsByTrailId'     => patrolsByTrail($db, $start, $end, $memberCtx),
  'violationsByCategory' => violations($db, $start, $end, $memberCtx),
  'treesCleared'         => treesCleared($db, $start, $end, $memberCtx),
  'membersByAge'         => membersByAge($db, $start, $end),
  'members'              => members($db),
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// Build WHERE clause parts + params array for t_report aliased as 'r'
function scopeWhere(?string $s, ?string $e, $memberCtx): array {
  $w = ['r.GroupID = ' . PWV_GROUP,
        '(r.IsDraft IS NULL OR r.IsDraft = 0)',
        '(r.IsUnofficial IS NULL OR r.IsUnofficial = 0)'];
  $p = [];
  if ($s) { $w[] = 'r.ActivityDate >= ?'; $p[] = $s; }
  if ($e) { $w[] = 'r.ActivityDate <= ?'; $p[] = $e; }
  if ($memberCtx !== 'all') {
    $w[] = 'EXISTS (SELECT 1 FROM t_report_member rmf WHERE rmf.ReportID = r.ReportID AND rmf.PersonID = ?)';
    $p[] = (int)$memberCtx;
  }
  return [implode(' AND ', $w), $p];
}

function summary(PDO $db, ?string $s, ?string $e, $ctx): array {
  [$w, $p] = scopeWhere($s, $e, $ctx);

  $row = $db->prepare("
    SELECT
      COUNT(DISTINCT r.ReportID) AS patrols,
      COUNT(DISTINCT wt.TrailID) AS trailsCovered,
      COALESCE(SUM(r.NumContacted), 0) AS hikersContacted,
      COUNT(DISTINCT rm.PersonID) AS totalActiveMembers,
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

  // trees cleared separately to avoid JOIN multiplication (exclude null TreeSize to match chart)
  [$w2, $p2] = scopeWhere($s, $e, $ctx);
  $trees = $db->prepare("
    SELECT COUNT(*) AS n
    FROM t_rpt_tree_down td
    JOIN t_report r ON r.ReportID = td.ReportID
    WHERE $w2 AND td.TreeSize IS NOT NULL
  ");
  $trees->execute($p2);
  $tc = (int)$trees->fetchColumn();

  return [
    'patrols'          => (int)$d['patrols'],
    'trailsCovered'    => (int)$d['trailsCovered'],
    'hikersContacted'  => (int)$d['hikersContacted'],
    'totalActiveMembers' => (int)$d['totalActiveMembers'],
    'volunteerHours'   => (float)($d['volunteerHours'] ?? 0),
    'treesCleared'     => $tc,
  ];
}

function patrolActivity(PDO $db, ?string $s, ?string $e, $ctx, string $range): array {
  [$w, $p] = scopeWhere($s, $e, $ctx);

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
  [$w, $p] = scopeWhere($s, $e, $ctx);

  // Patrol stats per trail
  $stmt = $db->prepare("
    SELECT
      wt.TrailID,
      COUNT(DISTINCT r.ReportID) AS patrols,
      COUNT(DISTINCT rm.PersonID) AS members,
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
  [$w2, $p2] = scopeWhere($s, $e, $ctx);
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
  [$w, $p] = scopeWhere($s, $e, $ctx);

  $stmt = $db->prepare("
    SELECT
      wt.TrailID,
      r.ReportID,
      DATE_FORMAT(r.ActivityDate,'%Y-%m-%d') AS date,
      COALESCE(GROUP_CONCAT(DISTINCT CONCAT(m.FirstName,' ',m.LastName)
               ORDER BY m.LastName SEPARATOR ' & '), 'Unknown') AS memberName,
      COALESCE(obs.hikersSeen, 0) AS hikersSeen,
      COALESCE(r.NumContacted, 0) AS hikersContacted,
      ROUND(
        CASE WHEN r.TimeStarted IS NOT NULL AND r.TimeEnded IS NOT NULL
             THEN TIMESTAMPDIFF(MINUTE, r.TimeStarted, r.TimeEnded) / 60.0
             ELSE 0 END,
      1) AS durationHours
    FROM t_report r
    JOIN lu_wksite_trail wt ON wt.WksiteID = r.WksiteID
    LEFT JOIN t_report_member rm ON rm.ReportID = r.ReportID
    LEFT JOIN t_member m ON m.PersonID = rm.PersonID
    LEFT JOIN (
      SELECT o.ReportID, SUM(o.NumSeen) AS hikersSeen
      FROM t_rpt_observation o
      JOIN lu_obs_type ot ON ot.ObsTypeID = o.ObsTypeID AND ot.CanContact = 1
      GROUP BY o.ReportID
    ) obs ON obs.ReportID = r.ReportID
    WHERE $w
    GROUP BY wt.TrailID, r.ReportID, r.ActivityDate, r.NumContacted, r.TimeStarted, r.TimeEnded, obs.hikersSeen
    ORDER BY wt.TrailID, r.ActivityDate DESC
  ");
  $stmt->execute($p);

  $result = [];
  foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $tid = (int)$row['TrailID'];
    if (!isset($result[$tid])) $result[$tid] = [];
    $result[$tid][] = [
      'date'           => $row['date'],
      'memberName'     => $row['memberName'],
      'hikersSeen'     => (int)$row['hikersSeen'],
      'hikersContacted'=> (int)$row['hikersContacted'],
      'durationHours'  => (float)$row['durationHours'],
    ];
  }
  return $result;
}

function violations(PDO $db, ?string $s, ?string $e, $ctx): array {
  [$w, $p] = scopeWhere($s, $e, $ctx);
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
    $result[] = ['category' => $row['category'], 'count' => (int)$row['cnt'], 'color' => 'amber'];
  }
  return $result;
}

function treesCleared(PDO $db, ?string $s, ?string $e, $ctx): array {
  // TreeSize is diameter in inches (actual value, not an ordinal code)
  $sizeClasses = [
    ['sizeClass' => '< 8"',      'label' => "Small\n(< 8\")",    'cond' => 'td.TreeSize < 8'],
    ['sizeClass' => '8" – 15"',  'label' => "Medium\n(8–15\")",  'cond' => 'td.TreeSize BETWEEN 8 AND 15'],
    ['sizeClass' => '16" – 23"', 'label' => "Large\n(16–23\")",  'cond' => 'td.TreeSize BETWEEN 16 AND 23'],
    ['sizeClass' => '24" – 36"', 'label' => "XL\n(24–36\")",     'cond' => 'td.TreeSize BETWEEN 24 AND 36'],
    ['sizeClass' => '> 36"',     'label' => "XXL\n(> 36\")",     'cond' => 'td.TreeSize > 36'],
  ];

  // Build one-pass conditional aggregation for totals
  $caseCols = [];
  foreach ($sizeClasses as $i => $sc) {
    $caseCols[] = "SUM(CASE WHEN {$sc['cond']} THEN 1 ELSE 0 END) AS s$i";
  }
  $selectCols = implode(', ', $caseCols);

  [$w, $p] = scopeWhere($s, $e, $ctx);
  $stmt = $db->prepare("
    SELECT $selectCols
    FROM t_rpt_tree_down td
    JOIN t_report r ON r.ReportID = td.ReportID
    WHERE $w AND td.TreeSize IS NOT NULL
  ");
  $stmt->execute($p);
  $aggRow = $stmt->fetch(PDO::FETCH_ASSOC);

  $aggregate = [];
  foreach ($sizeClasses as $i => $sc) {
    $aggregate[] = ['sizeClass' => $sc['sizeClass'], 'label' => $sc['label'], 'count' => (int)($aggRow["s$i"] ?? 0)];
  }

  // By trail — same conditional aggregation grouped per trail
  [$w2, $p2] = scopeWhere($s, $e, $ctx);
  $byTrailStmt = $db->prepare("
    SELECT t.TrailName, t.TrailNumber,
           SUM(CASE WHEN td.TreeSize < 8 THEN 1 ELSE 0 END) AS s0,
           SUM(CASE WHEN td.TreeSize BETWEEN 8 AND 15 THEN 1 ELSE 0 END) AS s1,
           SUM(CASE WHEN td.TreeSize BETWEEN 16 AND 23 THEN 1 ELSE 0 END) AS s2,
           SUM(CASE WHEN td.TreeSize BETWEEN 24 AND 36 THEN 1 ELSE 0 END) AS s3,
           SUM(CASE WHEN td.TreeSize > 36 THEN 1 ELSE 0 END) AS s4,
           COUNT(*) AS total
    FROM t_rpt_tree_down td
    JOIN t_report r ON r.ReportID = td.ReportID
    JOIN lu_wksite_trail wt ON wt.WksiteID = r.WksiteID
    JOIN lu_trail t ON t.TrailID = wt.TrailID
    WHERE $w2 AND td.TreeSize IS NOT NULL
    GROUP BY t.TrailID, t.TrailName, t.TrailNumber
    ORDER BY total DESC
  ");
  $byTrailStmt->execute($p2);

  $byTrail = [];
  foreach ($byTrailStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $trees = [];
    foreach ($sizeClasses as $i => $sc) {
      $trees[] = ['sizeClass' => $sc['sizeClass'], 'count' => (int)$row["s$i"]];
    }
    $byTrail[] = [
      'trailName'   => $row['TrailName'],
      'trailNumber' => $row['TrailNumber'] ?? '',
      'trees'       => $trees,
      'total'       => (int)$row['total'],
    ];
  }

  return ['aggregate' => $aggregate, 'byTrail' => $byTrail];
}

function membersByAge(PDO $db, ?string $s, ?string $e): array {
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
      SELECT DISTINCT rm.PersonID
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
  $stmt = $db->prepare("
    SELECT m.PersonID, m.FirstName, m.LastName,
           CONCAT(m.FirstName,' ',m.LastName) AS fullName,
           COUNT(DISTINCT rm.ReportID) AS patrols
    FROM t_member m
    JOIN t_mem_group mg ON mg.PersonID = m.PersonID AND mg.GroupID = " . PWV_GROUP . "
    LEFT JOIN t_report_member rm ON rm.PersonID = m.PersonID
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
