<?php
require_once __DIR__ . '/../config.php';

define('LB_PWV_GROUP', 10);
define('LB_TREE_ID_MIN', 1);
define('LB_TREE_ID_MAX', 5);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

try {
    $timeRange = $_GET['timeRange'] ?? 'year';
    if (!in_array($timeRange, ['week', 'month', 'quarter', 'year', 'all'], true)) {
        $timeRange = 'year';
    }

    $db = getDb();
    [$start, $end] = lbDateRange($timeRange);

    $members = lbMembers($db, $start, $end);
    $trends  = lbTrends($db);

    jsonOut(['members' => $members, 'trends' => $trends]);

} catch (Throwable $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    header('Access-Control-Allow-Origin: *');
    echo json_encode([
        'ok'     => false,
        'error'  => 'Leaderboard query failed',
        'detail' => $e->getMessage(),
        'file'   => $e->getFile(),
        'line'   => $e->getLine(),
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ── Date ranges ───────────────────────────────────────────────────────────────

/**
 * Returns [startDate|null, endDate|null] for the given leaderboard time range.
 * 'year' = Season to Date: Oct 1 of the current patrol season through today.
 */
function lbDateRange(string $r): array {
    $today = date('Y-m-d');
    $y     = (int) date('Y');
    $m     = (int) date('n');

    switch ($r) {
        case 'week':
            // Monday of the current ISO week
            return [date('Y-m-d', strtotime('monday this week')), $today];
        case 'month':
            return [date('Y-m-01'), $today];
        case 'quarter':
            $qm = (int) ceil($m / 3) * 3 - 2;  // first month of current quarter
            return [sprintf('%04d-%02d-01', $y, $qm), $today];
        case 'year':
            // Patrol season runs Oct 1 – Sep 30
            $seasonStart = ($m >= 10) ? "$y-10-01" : ($y - 1) . '-10-01';
            return [$seasonStart, $today];
        default: // all
            return [null, null];
    }
}

// ── Scope helpers ─────────────────────────────────────────────────────────────

/**
 * Build WHERE clause fragments + params for t_report (aliased 'r') scoped
 * to the PWV group, not draft/unofficial, and optionally date-filtered.
 * Returns [whereString, paramsArray].
 */
function lbScopeWhere(?string $start, ?string $end): array {
    $w = [
        'r.GroupID = ' . LB_PWV_GROUP,
        '(r.IsDraft IS NULL OR r.IsDraft = 0)',
        '(r.IsUnofficial IS NULL OR r.IsUnofficial = 0)',
    ];
    $p = [];
    if ($start !== null) { $w[] = 'r.ActivityDate >= ?'; $p[] = $start; }
    if ($end   !== null) { $w[] = 'r.ActivityDate <= ?'; $p[] = $end;   }
    return [implode(' AND ', $w), $p];
}

/**
 * Detect the brush clearing IDs from secrets (defaults: 6, 7, 8).
 */
function lbBrushIds(): string {
    $secrets = getSecrets();
    if (!empty($secrets['trail_clearing_brush_ids']) && is_array($secrets['trail_clearing_brush_ids'])) {
        $ids = array_filter(array_map('intval', $secrets['trail_clearing_brush_ids']), fn($n) => $n > 0);
        if ($ids) return implode(',', array_unique($ids));
    }
    return '6,7,8';
}

/**
 * Detect the quantity column for t_rpt_trail_clearing (cached for request lifetime).
 */
function lbQtyCol(PDO $db): string {
    static $col = null;
    if ($col !== null) return $col;
    foreach (['NumCleared', 'Qty', 'Quantity'] as $c) {
        try {
            $db->query("SELECT `$c` FROM `t_rpt_trail_clearing` LIMIT 0");
            $col = $c;
            return $col;
        } catch (Throwable $_) {}
    }
    $col = 'NumCleared';
    return $col;
}

// ── Members query ─────────────────────────────────────────────────────────────

function lbMembers(PDO $db, ?string $start, ?string $end): array {
    [$w, $p] = lbScopeWhere($start, $end);

    // ── 1. Base stats from t_report_member JOIN t_report ─────────────────────
    // One row per (member, report) — no trail join so no row multiplication.
    $baseStmt = $db->prepare("
        SELECT
            rm.PersonID,
            m.FirstName,
            m.LastName,
            COUNT(DISTINCT r.ReportID)                                                   AS patrolDays,
            COUNT(DISTINCT CASE WHEN r.ActMethodID IN (1,2) THEN r.ReportID END)         AS hikeDays,
            COUNT(DISTINCT CASE WHEN r.ActMethodID IN (3,4) THEN r.ReportID END)         AS stockDays,
            COUNT(DISTINCT CASE WHEN at.IsTrailWork = 1 THEN r.ReportID END)             AS trailworkDays,
            COUNT(DISTINCT CASE WHEN EXISTS (
                SELECT 1 FROM lu_wksite_trail wt2
                JOIN lu_trail lt2 ON lt2.TrailID = wt2.TrailID
                WHERE wt2.WksiteID = r.WksiteID AND lt2.InWilderness = 1
            ) THEN r.ReportID END)                                                       AS wildernessDays,
            COUNT(DISTINCT r.ActTypeID)                                                  AS trailTypes,
            ROUND(SUM(
                CASE
                    WHEN rm.TimeStarted IS NOT NULL AND rm.TimeEnded IS NOT NULL
                        THEN TIMESTAMPDIFF(MINUTE, rm.TimeStarted, rm.TimeEnded) / 60.0
                    WHEN r.TimeStarted IS NOT NULL AND r.TimeEnded IS NOT NULL
                        THEN TIMESTAMPDIFF(MINUTE, r.TimeStarted, r.TimeEnded) / 60.0
                    ELSE 0
                END
            ), 1)                                                                         AS totalHours,
            ROUND(SUM(
                CASE WHEN (at.IsTrailWork IS NULL OR at.IsTrailWork = 0) THEN
                    CASE
                        WHEN rm.TimeStarted IS NOT NULL AND rm.TimeEnded IS NOT NULL
                            THEN TIMESTAMPDIFF(MINUTE, rm.TimeStarted, rm.TimeEnded) / 60.0
                        WHEN r.TimeStarted IS NOT NULL AND r.TimeEnded IS NOT NULL
                            THEN TIMESTAMPDIFF(MINUTE, r.TimeStarted, r.TimeEnded) / 60.0
                        ELSE 0
                    END
                ELSE 0 END
            ), 1)                                                                         AS patrolHours
        FROM t_report_member rm
        JOIN t_report r        ON r.ReportID  = rm.ReportID
        JOIN t_member m        ON m.PersonID  = rm.PersonID
        JOIN lu_activity_type at ON at.ActTypeID = r.ActTypeID
        WHERE $w
        GROUP BY rm.PersonID, m.FirstName, m.LastName
        HAVING patrolDays > 0
    ");
    $baseStmt->execute($p);
    $base = [];
    foreach ($baseStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $pid = (int) $row['PersonID'];
        $base[$pid] = $row;
    }

    if (empty($base)) return [];

    // ── 2. Trail stats: trailCount + milesCovered ─────────────────────────────
    $trailStmt = $db->prepare("
        SELECT
            rm.PersonID,
            COUNT(DISTINCT lt.TrailID)      AS trailCount,
            SUM(COALESCE(lt.Length, 0))     AS milesCovered
        FROM t_report_member rm
        JOIN t_report r ON r.ReportID = rm.ReportID
        JOIN (
            SELECT DISTINCT wt.WksiteID, lt2.TrailID, COALESCE(lt2.Length, 0) AS Length
            FROM lu_wksite_trail wt
            JOIN lu_trail lt2 ON lt2.TrailID = wt.TrailID AND (lt2.IsRoad IS NULL OR lt2.IsRoad = 0)
        ) lt ON lt.WksiteID = r.WksiteID
        WHERE $w
        GROUP BY rm.PersonID
    ");
    $trailStmt->execute($p);
    $trails = [];
    foreach ($trailStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $trails[(int)$row['PersonID']] = $row;
    }

    // ── 3. Weighted work: contacts, treesCleared, brushing ────────────────────
    $qtyCol   = lbQtyCol($db);
    $brushIds = lbBrushIds();

    $workStmt = $db->prepare("
        SELECT
            rm.PersonID,
            ROUND(SUM(COALESCE(obs.contacts, 0)   / GREATEST(COALESCE(party.party_n, 1), 1)), 0) AS contacts,
            ROUND(SUM(COALESCE(trees.treeQty, 0)  / GREATEST(COALESCE(party.party_n, 1), 1)), 1) AS treesCleared,
            ROUND(SUM(COALESCE(brush.brushQty, 0) / GREATEST(COALESCE(party.party_n, 1), 1)), 0) AS brushing
        FROM t_report_member rm
        JOIN t_report r ON r.ReportID = rm.ReportID
        LEFT JOIN (
            SELECT o.ReportID, SUM(o.NumContacted) AS contacts
            FROM t_rpt_observation o
            JOIN lu_obs_type ot ON ot.ObsTypeID = o.ObsTypeID AND ot.CanContact = 1
            GROUP BY o.ReportID
        ) obs   ON obs.ReportID   = r.ReportID
        LEFT JOIN (
            SELECT tc.ReportID, SUM(COALESCE(tc.`$qtyCol`, 0)) AS treeQty
            FROM t_rpt_trail_clearing tc
            WHERE tc.TrailClearingID BETWEEN " . LB_TREE_ID_MIN . " AND " . LB_TREE_ID_MAX . "
            GROUP BY tc.ReportID
        ) trees ON trees.ReportID = r.ReportID
        LEFT JOIN (
            SELECT tc.ReportID, SUM(COALESCE(tc.`$qtyCol`, 0)) AS brushQty
            FROM t_rpt_trail_clearing tc
            WHERE tc.TrailClearingID IN ($brushIds)
            GROUP BY tc.ReportID
        ) brush ON brush.ReportID = r.ReportID
        LEFT JOIN (
            SELECT rm2.ReportID, COUNT(DISTINCT rm2.PersonID) AS party_n
            FROM t_report_member rm2
            GROUP BY rm2.ReportID
        ) party ON party.ReportID = r.ReportID
        WHERE $w
        GROUP BY rm.PersonID
    ");
    $workStmt->execute($p);
    $work = [];
    foreach ($workStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $work[(int)$row['PersonID']] = $row;
    }

    // ── 4. Extra fields: fireRings, trash (from t_rpt_extra) ─────────────────
    $extraWork = [];
    try {
        $extraStmt = $db->prepare("
            SELECT
                rm.PersonID,
                ROUND(SUM(
                    (COALESCE(ex.NumFireRingsRemoved, 0) + COALESCE(ex.NumFireRingsImproved, 0))
                    / GREATEST(COALESCE(party.party_n, 1), 1)
                ), 0) AS fireRings,
                ROUND(SUM(
                    COALESCE(ex.TrashPounds, 0)
                    / GREATEST(COALESCE(party.party_n, 1), 1)
                ), 1) AS trash
            FROM t_report_member rm
            JOIN t_report r    ON r.ReportID  = rm.ReportID
            LEFT JOIN t_rpt_extra ex ON ex.ReportID = r.ReportID
            LEFT JOIN (
                SELECT rm2.ReportID, COUNT(DISTINCT rm2.PersonID) AS party_n
                FROM t_report_member rm2
                GROUP BY rm2.ReportID
            ) party ON party.ReportID = r.ReportID
            WHERE $w
            GROUP BY rm.PersonID
        ");
        $extraStmt->execute($p);
        foreach ($extraStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $extraWork[(int)$row['PersonID']] = $row;
        }
    } catch (Throwable $e) {
        error_log('lbMembers extraWork: ' . $e->getMessage());
    }

    // ── 5. Activity type names per member ────────────────────────────────────
    $typeNamesStmt = $db->prepare("
        SELECT
            rm.PersonID,
            GROUP_CONCAT(DISTINCT at.ActTypeName ORDER BY at.ActTypeName SEPARATOR '|') AS typeNames
        FROM t_report_member rm
        JOIN t_report r         ON r.ReportID  = rm.ReportID
        JOIN lu_activity_type at ON at.ActTypeID = r.ActTypeID
        WHERE $w
        GROUP BY rm.PersonID
    ");
    $typeNamesStmt->execute($p);
    $typeNamesMap = [];
    foreach ($typeNamesStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $pid = (int) $row['PersonID'];
        $typeNamesMap[$pid] = !empty($row['typeNames']) ? explode('|', $row['typeNames']) : [];
    }

    // ── 6. Merge and build output ─────────────────────────────────────────────
    $result = [];
    foreach ($base as $pid => $b) {
        $t  = $trails[$pid]    ?? [];
        $wk = $work[$pid]      ?? [];
        $ex = $extraWork[$pid] ?? [];

        $firstName = trim($b['FirstName'] ?? '');
        $lastName  = trim($b['LastName']  ?? '');
        $name      = trim("$firstName $lastName");
        $initials  = lbInitials($firstName, $lastName);

        $patrolHours    = (float)($b['patrolHours']    ?? 0);
        $totalHours     = (float)($b['totalHours']     ?? 0);
        $nonPatrolHours = round(max(0.0, $totalHours - $patrolHours), 1);

        $result[] = [
            'id'             => (string) $pid,
            'name'           => $name,
            'initials'       => $initials,
            'patrolDays'     => (int)($b['patrolDays']     ?? 0),
            'hikeDays'       => (int)($b['hikeDays']       ?? 0),
            'stockDays'      => (int)($b['stockDays']      ?? 0),
            'trailworkDays'  => (int)($b['trailworkDays']  ?? 0),
            'wildernessDays' => (int)($b['wildernessDays'] ?? 0),
            'contacts'       => (int)($wk['contacts']      ?? 0),
            'treesCleared'   => round((float)($wk['treesCleared'] ?? 0), 1),
            'brushing'       => (int)($wk['brushing']      ?? 0),
            'fireRings'      => (int)($ex['fireRings']     ?? 0),
            'trash'          => round((float)($ex['trash'] ?? 0), 1),
            'milesCovered'   => round((float)($t['milesCovered'] ?? 0), 1),
            'trailCount'     => (int)($t['trailCount']     ?? 0),
            'trailTypes'     => (int)($b['trailTypes']     ?? 0),
            'patrolTypeNames' => $typeNamesMap[$pid] ?? [],
            'totalHours'     => $totalHours,
            'patrolHours'    => $patrolHours,
            'nonPatrolHours' => $nonPatrolHours,
        ];
    }

    return $result;
}

/**
 * Generate 1–2 letter initials from first + last name.
 */
function lbInitials(string $first, string $last): string {
    $f = mb_substr(trim($first), 0, 1);
    $l = mb_substr(trim($last),  0, 1);
    return strtoupper($f . $l) ?: '?';
}

// ── Trends query ──────────────────────────────────────────────────────────────

function lbTrends(PDO $db): array {
    $curYear  = (int) date('Y');
    $prevYear = $curYear - 1;
    $g        = LB_PWV_GROUP;

    $base = "r.GroupID = $g
          AND (r.IsDraft IS NULL OR r.IsDraft = 0)
          AND (r.IsUnofficial IS NULL OR r.IsUnofficial = 0)";

    // ── Patrol activity by week (current year) ────────────────────────────────
    $weekRows = $db->prepare("
        SELECT YEARWEEK(r.ActivityDate, 1)  AS wk,
               MIN(r.ActivityDate)          AS wstart,
               COUNT(DISTINCT r.ReportID)   AS n
        FROM t_report r
        WHERE $base AND YEAR(r.ActivityDate) = ?
        GROUP BY wk ORDER BY wk
    ");
    $weekRows->execute([$curYear]);
    $patrolActivityByWeek = [];
    foreach ($weekRows->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $d = new DateTime($row['wstart']);
        $patrolActivityByWeek[] = [
            'label' => $d->format('M') . ' W' . ceil((int)$d->format('j') / 7),
            'count' => (int) $row['n'],
        ];
    }

    // ── Violations by month (current year) ───────────────────────────────────
    $violRows = $db->prepare("
        SELECT DATE_FORMAT(r.ActivityDate, '%Y-%m') AS ym,
               vt.ViolTypeName,
               SUM(rv.NumSeen) AS cnt
        FROM t_rpt_violation rv
        JOIN lu_viol_type vt ON vt.ViolTypeID = rv.ViolTypeID
        JOIN t_report r ON r.ReportID = rv.ReportID
        WHERE $base AND YEAR(r.ActivityDate) = ?
        GROUP BY ym, vt.ViolTypeID, vt.ViolTypeName
        ORDER BY ym
    ");
    $violRows->execute([$curYear]);
    $violByMonth = [];
    foreach ($violRows->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $ym  = $row['ym'];
        $cat = lbViolCategory((string)$row['ViolTypeName']);
        if (!isset($violByMonth[$ym])) {
            $violByMonth[$ym] = ['offLeashDog' => 0, 'campfire' => 0, 'nonDesignatedCamping' => 0, 'other' => 0];
        }
        $violByMonth[$ym][$cat] += (int) $row['cnt'];
    }
    $violationsByMonth = [];
    foreach ($violByMonth as $ym => $cats) {
        $violationsByMonth[] = array_merge(['month' => lbMonthLabel($ym)], $cats);
    }

    // ── Trees by size by month (current year) ─────────────────────────────────
    $qtyCol = lbQtyCol($db);
    $treeRows = $db->prepare("
        SELECT DATE_FORMAT(r.ActivityDate, '%Y-%m') AS ym,
               tc.TrailClearingID,
               SUM(COALESCE(tc.`$qtyCol`, 0)) AS qty
        FROM t_rpt_trail_clearing tc
        JOIN t_report r ON r.ReportID = tc.ReportID
        WHERE $base
          AND YEAR(r.ActivityDate) = ?
          AND tc.TrailClearingID BETWEEN " . LB_TREE_ID_MIN . " AND " . LB_TREE_ID_MAX . "
        GROUP BY ym, tc.TrailClearingID
        ORDER BY ym
    ");
    $treeRows->execute([$curYear]);
    $treesByYM = [];
    foreach ($treeRows->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $ym  = $row['ym'];
        $cid = (int) $row['TrailClearingID'];
        if (!isset($treesByYM[$ym])) {
            $treesByYM[$ym] = ['under8in' => 0, 'eightTo15in' => 0, 'sixteenTo23in' => 0, 'twentyFourTo36in' => 0, 'over36in' => 0];
        }
        $key = lbTreeSizeKey($cid);
        $treesByYM[$ym][$key] += (float) $row['qty'];
    }
    $treesBySizeByMonth = [];
    foreach ($treesByYM as $ym => $sizes) {
        $treesBySizeByMonth[] = array_merge(['month' => lbMonthLabel($ym)], array_map('intval', $sizes));
    }

    // ── Seasonal patrols by calendar month (all-time) ─────────────────────────
    $seasonalRows = $db->prepare("
        SELECT DATE_FORMAT(r.ActivityDate, '%m') AS cal_month,
               COUNT(DISTINCT r.ReportID) AS n
        FROM t_report r
        WHERE $base
        GROUP BY cal_month ORDER BY cal_month
    ");
    $seasonalRows->execute();
    $seasonalByMon = [];
    foreach ($seasonalRows->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $mon = (int) $row['cal_month'];
        $seasonalByMon[$mon] = (int) $row['n'];
    }
    $monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    $seasonalPatrolsByMonth = [];
    foreach ($monthNames as $i => $name) {
        $seasonalPatrolsByMonth[] = ['month' => $name, 'patrols' => $seasonalByMon[$i + 1] ?? 0];
    }

    // ── Year-over-year (previous vs current calendar year) ────────────────────
    $yoyRows = $db->prepare("
        SELECT YEAR(r.ActivityDate) AS yr,
               DATE_FORMAT(r.ActivityDate, '%m') AS cal_month,
               COUNT(DISTINCT r.ReportID) AS n
        FROM t_report r
        WHERE $base AND YEAR(r.ActivityDate) IN (?, ?)
        GROUP BY yr, cal_month ORDER BY yr, cal_month
    ");
    $yoyRows->execute([$prevYear, $curYear]);
    $yoyData = [];
    foreach ($yoyRows->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $yr  = (int) $row['yr'];
        $mon = (int) $row['cal_month'];
        if ($yr === $prevYear) $yoyData['prev'][$mon] = (int) $row['n'];
        if ($yr === $curYear)  $yoyData['cur'][$mon]  = (int) $row['n'];
    }
    $yearOverYear = [];
    foreach ($monthNames as $i => $name) {
        $mon = $i + 1;
        $yearOverYear[] = [
            'month'        => $name,
            'previousYear' => $yoyData['prev'][$mon] ?? 0,
            'currentYear'  => $yoyData['cur'][$mon]  ?? 0,
        ];
    }

    return compact(
        'patrolActivityByWeek',
        'violationsByMonth',
        'treesBySizeByMonth',
        'seasonalPatrolsByMonth',
        'yearOverYear'
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Map violation type name → one of the four chart categories.
 */
function lbViolCategory(string $name): string {
    $n = strtolower($name);
    if (strpos($n, 'dog') !== false || strpos($n, 'leash') !== false) return 'offLeashDog';
    if (strpos($n, 'campfire') !== false || strpos($n, 'fire') !== false) return 'campfire';
    if (strpos($n, 'camp') !== false || strpos($n, 'camping') !== false) return 'nonDesignatedCamping';
    return 'other';
}

/**
 * Map TrailClearingID (1–5) to size-class key matching the Trends type.
 */
function lbTreeSizeKey(int $cid): string {
    return match ($cid) {
        1 => 'under8in',
        2 => 'eightTo15in',
        3 => 'sixteenTo23in',
        4 => 'twentyFourTo36in',
        5 => 'over36in',
        default => 'under8in',
    };
}

/**
 * Convert 'YYYY-MM' to 3-letter month name (e.g. '2025-06' → 'Jun').
 */
function lbMonthLabel(string $ym): string {
    static $names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    $parts = explode('-', $ym);
    $mon   = isset($parts[1]) ? ((int)$parts[1] - 1) : 0;
    return $names[max(0, min(11, $mon))];
}
