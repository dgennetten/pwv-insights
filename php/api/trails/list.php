<?php
require_once __DIR__ . '/../config.php';

define('TRAILS_PWV_GROUP', 10);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

try {
    $db = getDb();

    // Rolling 12-month window — always captures a full patrol season worth of data
    // regardless of where we are in the Oct 1–Sep 30 season year. A hard Oct 1
    // cutoff leaves May–Sep (peak hiking) outside the window until next summer.
    $startDate   = date('Y-m-d', strtotime('-365 days'));
    $endDate     = date('Y-m-d');
    $monthsSoFar = 12;

    // ── 1. All trail worksites with area + trail metadata ────────────────────
    // Only include worksites that have BOTH an area assignment AND trail
    // assignments, and where at least one trail is not a road (IsRoad = 0).
    $sql = "
        SELECT
            w.WksiteID,
            w.WksiteName,
            a.AreaName,
            MIN(d.TrDifficultyID) AS DifficultyID,
            ROUND(AVG(COALESCE(t.Length, 0)), 1) AS LengthMiles,
            MAX(t.InWilderness) AS InWilderness,
            GROUP_CONCAT(
                DISTINCT CASE
                    WHEN t.TrailNumber REGEXP '^[0-9]+$'
                    THEN CAST(t.TrailNumber AS UNSIGNED)
                    ELSE NULL
                END
                ORDER BY t.TrailID
            ) AS TrailNumbers
        FROM lu_worksite w
        INNER JOIN lu_wksite_area  wa ON wa.WksiteID = w.WksiteID
        INNER JOIN lu_area          a  ON a.AreaID    = wa.AreaID
        INNER JOIN lu_wksite_trail  wt ON wt.WksiteID = w.WksiteID
        INNER JOIN lu_trail          t  ON t.TrailID   = wt.TrailID AND t.IsRoad = 0
        INNER JOIN lu_trail_difficulty d ON d.TrDifficultyID = t.TrDifficultyID
        WHERE w.MaxMiles IS NOT NULL
        GROUP BY w.WksiteID, w.WksiteName, a.AreaName
        ORDER BY a.AreaID, w.WksiteName
    ";
    $wksites = $db->query($sql)->fetchAll(PDO::FETCH_ASSOC);

    if (empty($wksites)) {
        jsonOut(['trails' => [], 'year' => $year]);
    }

    $wksiteIds = array_map('intval', array_column($wksites, 'WksiteID'));
    $in        = implode(',', array_fill(0, count($wksiteIds), '?'));

    // ── 2. Patrol stats for current year ─────────────────────────────────────
    $patrolStats = [];
    $stmt = $db->prepare("
        SELECT
            r.WksiteID,
            COUNT(DISTINCT r.ReportID)              AS PatrolCount,
            MAX(r.ActivityDate)                     AS LastPatrolDate,
            SUM(COALESCE(r.TravelMinutes, 0)) / 60.0 AS TotalHours
        FROM t_report r
        WHERE r.WksiteID IN ($in)
          AND r.ActivityDate BETWEEN ? AND ?
          AND r.GroupID = ?
          AND (r.IsDraft     IS NULL OR r.IsDraft     = 0)
          AND (r.IsUnofficial IS NULL OR r.IsUnofficial = 0)
        GROUP BY r.WksiteID
    ");
    $stmt->execute([...$wksiteIds, $startDate, $endDate, TRAILS_PWV_GROUP]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $patrolStats[(int)$row['WksiteID']] = $row;
    }

    // ── 2b. Hiker counts from t_rpt_observation (CanContact types only) ───────
    // t_report.NumContacted is not used — real seen/contacted counts are in
    // t_rpt_observation, mirroring how the Activity Dashboard queries them.
    $hikerStats = [];
    $stmt = $db->prepare("
        SELECT
            r.WksiteID,
            COALESCE(SUM(o.NumSeen),      0) AS HikersSeen,
            COALESCE(SUM(o.NumContacted), 0) AS HikersContacted
        FROM t_rpt_observation o
        JOIN lu_obs_type ot ON ot.ObsTypeID = o.ObsTypeID AND ot.CanContact = 1
        JOIN t_report r     ON r.ReportID   = o.ReportID
        WHERE r.WksiteID IN ($in)
          AND r.ActivityDate BETWEEN ? AND ?
          AND r.GroupID = ?
          AND (r.IsDraft     IS NULL OR r.IsDraft     = 0)
          AND (r.IsUnofficial IS NULL OR r.IsUnofficial = 0)
        GROUP BY r.WksiteID
    ");
    $stmt->execute([...$wksiteIds, $startDate, $endDate, TRAILS_PWV_GROUP]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $hikerStats[(int)$row['WksiteID']] = $row;
    }

    // ── 3. Trees DOWN by size class (t_rpt_tree_down.TreeSize 1–5) ──────────
    $treesDown = [];
    $stmt = $db->prepare("
        SELECT r.WksiteID, td.TreeSize, COUNT(*) AS TreeCount
        FROM t_rpt_tree_down td
        JOIN t_report r ON r.ReportID = td.ReportID
        WHERE r.WksiteID IN ($in)
          AND r.ActivityDate BETWEEN ? AND ?
          AND r.GroupID = ?
          AND (r.IsDraft IS NULL OR r.IsDraft = 0)
          AND td.TreeSize BETWEEN 1 AND 5
        GROUP BY r.WksiteID, td.TreeSize
    ");
    $stmt->execute([...$wksiteIds, $startDate, $endDate, TRAILS_PWV_GROUP]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $treesDown[(int)$row['WksiteID']][(int)$row['TreeSize']] = (int)$row['TreeCount'];
    }

    // ── 4. Trees CLEARED by size class (t_rpt_trail_clearing ID 1–5) ────────
    // Detect the quantity column — mirrors dashboard/data.php:trailClearingQtyColumn().
    // The column may be NumCleared, Qty, or Quantity depending on the DB version.
    $clearingQtyCol = 'NumCleared';
    foreach (['NumCleared', 'Qty', 'Quantity'] as $candidate) {
        try {
            $db->query("SELECT `$candidate` FROM `t_rpt_trail_clearing` LIMIT 0");
            $clearingQtyCol = $candidate;
            break;
        } catch (Throwable $e) { /* column absent — try next */ }
    }

    $treesCleared = [];
    $stmt = $db->prepare("
        SELECT r.WksiteID, tc.TrailClearingID, SUM(COALESCE(tc.`$clearingQtyCol`, 0)) AS NumCleared
        FROM t_rpt_trail_clearing tc
        JOIN t_report r ON r.ReportID = tc.ReportID
        WHERE r.WksiteID IN ($in)
          AND r.ActivityDate BETWEEN ? AND ?
          AND r.GroupID = ?
          AND (r.IsDraft IS NULL OR r.IsDraft = 0)
          AND tc.TrailClearingID BETWEEN 1 AND 5
        GROUP BY r.WksiteID, tc.TrailClearingID
    ");
    $stmt->execute([...$wksiteIds, $startDate, $endDate, TRAILS_PWV_GROUP]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $treesCleared[(int)$row['WksiteID']][(int)$row['TrailClearingID']] = (int)$row['NumCleared'];
    }

    // ── 5. Violations by category ─────────────────────────────────────────────
    $violations = [];
    $stmt = $db->prepare("
        SELECT r.WksiteID, vt.ViolTypeName, SUM(COALESCE(rv.NumSeen, 1)) AS ViolCount
        FROM t_rpt_violation rv
        JOIN t_report        r  ON r.ReportID  = rv.ReportID
        JOIN lu_viol_type    vt ON vt.ViolTypeID = rv.ViolTypeID
        WHERE r.WksiteID IN ($in)
          AND r.ActivityDate BETWEEN ? AND ?
          AND r.GroupID = ?
          AND (r.IsDraft IS NULL OR r.IsDraft = 0)
        GROUP BY r.WksiteID, rv.ViolTypeID, vt.ViolTypeName
        ORDER BY r.WksiteID, ViolCount DESC
    ");
    $stmt->execute([...$wksiteIds, $startDate, $endDate, TRAILS_PWV_GROUP]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $violations[(int)$row['WksiteID']][] = [
            'category' => $row['ViolTypeName'],
            'count'    => (int)$row['ViolCount'],
        ];
    }

    // ── 6. Maintenance work ──────────────────────────────────────────────────
    $maintenance = [];
    $stmt = $db->prepare("
        SELECT
            r.WksiteID,
            r.ActivityDate,
            tw.TrailWorkName AS WorkType,
            SUM(COALESCE(rw.NumConstructed, 1)) AS Qty
        FROM t_rpt_trail_work rw
        JOIN t_report     r  ON r.ReportID    = rw.ReportID
        JOIN lu_trail_work tw ON tw.TrailWorkID = rw.TrailWorkID
        WHERE r.WksiteID IN ($in)
          AND r.ActivityDate BETWEEN ? AND ?
          AND r.GroupID = ?
          AND (r.IsDraft IS NULL OR r.IsDraft = 0)
        GROUP BY r.WksiteID, r.ActivityDate, rw.TrailWorkID, tw.TrailWorkName
        ORDER BY r.WksiteID, r.ActivityDate DESC
    ");
    $stmt->execute([...$wksiteIds, $startDate, $endDate, TRAILS_PWV_GROUP]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $wid = (int)$row['WksiteID'];
        if (count($maintenance[$wid] ?? []) < 30) {
            $maintenance[$wid][] = [
                'date'     => $row['ActivityDate'],
                'workType' => $row['WorkType'],
                'quantity' => (int)$row['Qty'],
                'unit'     => 'each',
                'notes'    => '',
            ];
        }
    }

    // ── 7. Parking lot vehicle counts ────────────────────────────────────────
    // Sums the per-visit vehicle count (NumVehiclesStart preferred, else End)
    // across all patrol reports that recorded parking data for each worksite.
    // Worksites with zero matching rows have NO entry in $vehicleCounts.
    $vehicleCounts = [];
    $stmt = $db->prepare("
        SELECT r.WksiteID,
               SUM(COALESCE(pl.NumVehiclesStart, pl.NumVehiclesEnd, 0)) AS TotalVehicles
        FROM t_rpt_parking_lot pl
        JOIN t_report r ON r.ReportID = pl.ReportID
        WHERE r.WksiteID IN ($in)
          AND r.ActivityDate BETWEEN ? AND ?
          AND r.GroupID = ?
          AND (r.IsDraft     IS NULL OR r.IsDraft     = 0)
          AND (r.IsUnofficial IS NULL OR r.IsUnofficial = 0)
        GROUP BY r.WksiteID
    ");
    $stmt->execute([...$wksiteIds, $startDate, $endDate, TRAILS_PWV_GROUP]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $vehicleCounts[(int)$row['WksiteID']] = (int)$row['TotalVehicles'];
    }

    // ── 8. Patrol history (up to 20 most-recent patrols per worksite) ────────
    $patrolHistory = [];
    $historyCounts = [];
    $stmt = $db->prepare("
        SELECT
            r.WksiteID,
            r.ActivityDate,
            CASE
                WHEN m.FirstName IS NOT NULL
                THEN CONCAT(m.FirstName, ' ', LEFT(m.LastName, 1), '.')
                ELSE 'Unknown'
            END AS MemberName,
            COALESCE(obs.HikersSeen,      0) AS HikersSeen,
            COALESCE(obs.HikersContacted, 0) AS HikersContacted,
            ROUND(COALESCE(r.TravelMinutes,0)/60,1) AS DurationHours
        FROM t_report r
        LEFT JOIN t_member m ON m.PersonID = r.ReportWriterID
        LEFT JOIN (
            SELECT o.ReportID,
                   SUM(o.NumSeen)      AS HikersSeen,
                   SUM(o.NumContacted) AS HikersContacted
            FROM t_rpt_observation o
            JOIN lu_obs_type ot ON ot.ObsTypeID = o.ObsTypeID AND ot.CanContact = 1
            GROUP BY o.ReportID
        ) obs ON obs.ReportID = r.ReportID
        WHERE r.WksiteID IN ($in)
          AND r.ActivityDate BETWEEN ? AND ?
          AND r.GroupID = ?
          AND (r.IsDraft     IS NULL OR r.IsDraft     = 0)
          AND (r.IsUnofficial IS NULL OR r.IsUnofficial = 0)
        ORDER BY r.WksiteID, r.ActivityDate DESC
    ");
    $stmt->execute([...$wksiteIds, $startDate, $endDate, TRAILS_PWV_GROUP]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $wid = (int)$row['WksiteID'];
        if (($historyCounts[$wid] ?? 0) >= 20) continue;
        $patrolHistory[$wid][] = [
            'date'            => $row['ActivityDate'],
            'memberName'      => $row['MemberName'],
            'hikersSeen'      => (int)$row['HikersSeen'],
            'hikersContacted' => (int)$row['HikersContacted'],
            'durationHours'   => (float)$row['DurationHours'],
        ];
        $historyCounts[$wid] = ($historyCounts[$wid] ?? 0) + 1;
    }

    // ── 8. Assemble trail response ────────────────────────────────────────────
    $sizeMap = [1 => 'small', 2 => 'medium', 3 => 'large', 4 => 'xl', 5 => 'xxl'];
    $emptyTree = ['small' => 0, 'medium' => 0, 'large' => 0, 'xl' => 0, 'xxl' => 0];

    $trails = [];
    foreach ($wksites as $w) {
        $wid    = (int)$w['WksiteID'];
        $stats           = $patrolStats[$wid] ?? [];
        $patrol          = (int)($stats['PatrolCount'] ?? 0);
        $hikersSeen      = (int)($hikerStats[$wid]['HikersSeen']      ?? 0);
        $hikersContacted = (int)($hikerStats[$wid]['HikersContacted'] ?? 0);
        $length          = (float)$w['LengthMiles'];

        // Efficiency score: contacts per vehicle-visit this season (null when no parking data).
        // Score = min(100, contacts * 100 / total_vehicles).
        // A score of 100 means we contacted as many people as there were vehicle-starts recorded.
        // Trails with no t_rpt_parking_lot entries for this period are excluded (null).
        $totalVehicles = $vehicleCounts[$wid] ?? 0;
        if ($totalVehicles > 0) {
            $effScore = min(100, (int) round($hikersContacted * 100 / $totalVehicles));
        } else {
            $effScore = null;
        }

        $difficulty = match((int)$w['DifficultyID']) {
            1       => 'easy',
            3       => 'hard',
            default => 'moderate',
        };

        // Build trees down/cleared
        $down    = $emptyTree;
        $cleared = $emptyTree;
        foreach ($treesDown[$wid]   ?? [] as $s => $c) {
            if (isset($sizeMap[$s])) $down[$sizeMap[$s]]    = $c;
        }
        foreach ($treesCleared[$wid] ?? [] as $s => $c) {
            if (isset($sizeMap[$s])) $cleared[$sizeMap[$s]] = $c;
        }

        $trailNums        = $w['TrailNumbers']
            ? array_values(array_filter(array_map('intval', explode(',', $w['TrailNumbers']))))
            : [];
        $primaryTrailNum  = $trailNums[0] ?? 0;
        $patrolFreq = round($patrol / $monthsSoFar, 2);

        $trails[] = [
            'id'                    => 'w' . $wid,
            'wksiteId'              => $wid,
            'name'                  => $w['WksiteName'],
            'trailNumber'           => $primaryTrailNum,
            'trailNumbers'          => $trailNums,
            'lengthMiles'           => $length,
            'area'                  => $w['AreaName'],
            'difficulty'            => $difficulty,
            'wilderness'            => (bool)(int)$w['InWilderness'],
            'patrolCount'           => $patrol,
            'patrolFrequency'       => $patrolFreq,
            'hikersSeen'            => $hikersSeen,
            'hikersContacted'       => $hikersContacted,
            'lastPatrolDate'        => $stats['LastPatrolDate'] ?? null,
            'efficiencyScore'       => $effScore,
            'underPatrolled'        => $effScore !== null && $effScore < 50,
            'patrolHistory'         => $patrolHistory[$wid] ?? [],
            'treesDown'             => $down,
            'treesCleared'          => $cleared,
            'violationsByCategory'  => $violations[$wid] ?? [],
            'maintenanceWork'       => $maintenance[$wid] ?? [],
        ];
    }

    jsonOut(['trails' => $trails, 'year' => $year]);

} catch (Throwable $e) {
    error_log('trails/list.php: ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
    jsonOut(['error' => 'Failed to load trails', 'trails' => []], 500);
}
