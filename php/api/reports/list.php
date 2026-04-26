<?php
require_once __DIR__ . '/../config.php';

define('REPORTS_PWV_GROUP', 10);

/** Comma-separated brush/limbing TrailClearingIDs to exclude from tree totals (default 6,7,8). */
function reportsBrushIdList(): string {
    static $result = null;
    if ($result !== null) return $result;
    $ids = getSecrets()['trail_clearing_brush_ids'] ?? [6, 7, 8];
    if (!is_array($ids) || empty($ids)) return $result = '-1';
    return $result = implode(',', array_map('intval', $ids));
}

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function reportsPersonIdColumn(PDO $db): string {
    static $resolved = null;
    if ($resolved !== null) return $resolved;
    foreach (['PersonID', 'MemberPersonID', 'VolunteerPersonID', 'MemberID'] as $c) {
        try {
            $db->query("SELECT `$c` FROM `t_report_member` LIMIT 0");
            return $resolved = $c;
        } catch (Throwable $e) { /* try next */ }
    }
    return $resolved = 'PersonID';
}

try {
    $db    = getDb();
    $rmPid = reportsPersonIdColumn($db);

    // Resolve memberContext: 'all' or a positive integer PersonID
    $rawCtx   = $_GET['memberContext'] ?? 'all';
    $personId = null;
    if ($rawCtx !== 'all') {
        $n = (int) $rawCtx;
        if ($n >= 1) $personId = $n;
    }

    // Season filter — same Oct 1 boundary logic as trails/list.php
    $requestedSeason = (($_GET['season'] ?? 'current') === 'last') ? 'last' : 'current';
    $today           = new DateTime();
    $currentMonth    = (int) $today->format('n');
    $currentYear     = (int) $today->format('Y');
    $seasonStartYear = $currentMonth >= 10 ? $currentYear : $currentYear - 1;

    if ($requestedSeason === 'last') {
        $startDate = ($seasonStartYear - 1) . '-10-01';
        $endDate   = $seasonStartYear . '-09-30';
    } else {
        $startDate = $seasonStartYear . '-10-01';
        $endDate   = $today->format('Y-m-d');
    }

    // Base WHERE clause — always filter to PWV group, season window, exclude drafts/unofficial
    $baseWhere = "
        r.GroupID = ?
        AND r.ActivityDate BETWEEN ? AND ?
        AND (r.IsDraft      IS NULL OR r.IsDraft      = 0)
        AND (r.IsUnofficial IS NULL OR r.IsUnofficial = 0)
    ";
    $baseParams = [REPORTS_PWV_GROUP, $startDate, $endDate];

    // When a PersonID is supplied, restrict to reports where that person is either
    // the report writer OR appears in t_report_member.
    if ($personId !== null) {
        $baseWhere .= "
            AND (
                r.ReportWriterID = ?
                OR EXISTS (
                    SELECT 1 FROM t_report_member mx
                    WHERE mx.ReportID = r.ReportID AND mx.$rmPid = ?
                )
            )
        ";
        $baseParams[] = $personId;
        $baseParams[] = $personId;
    }

    $brushIds = reportsBrushIdList();
    $stmt = $db->prepare("
        SELECT
            r.ReportID,
            r.ActivityDate,
            CASE
                WHEN w.PersonID IS NOT NULL
                THEN CONCAT(w.FirstName, ' ', w.LastName)
                ELSE NULL
            END AS WriterName,
            GROUP_CONCAT(
                DISTINCT CASE
                    WHEN m.PersonID IS NOT NULL AND m.PersonID != COALESCE(r.ReportWriterID, -1)
                    THEN CONCAT(m.FirstName, ' ', m.LastName)
                    ELSE NULL
                END
                ORDER BY m.LastName, m.FirstName
                SEPARATOR ', '
            ) AS OtherMembers,
            (SELECT COALESCE(SUM(o.NumSeen), 0)
             FROM t_rpt_observation o WHERE o.ReportID = r.ReportID) AS HikersSeen,
            (SELECT COALESCE(SUM(o.NumContacted), 0)
             FROM t_rpt_observation o WHERE o.ReportID = r.ReportID) AS HikersContacted,
            (SELECT COALESCE(SUM(tc.NumCleared), 0)
             FROM t_rpt_trail_clearing tc
             WHERE tc.ReportID = r.ReportID
               AND tc.TrailClearingID NOT IN ($brushIds)) AS TreesCleared
        FROM t_report r
        LEFT JOIN t_member w
               ON w.PersonID = r.ReportWriterID
        LEFT JOIN t_report_member rm
               ON rm.ReportID = r.ReportID
        LEFT JOIN t_member m
               ON m.PersonID = rm.$rmPid
        WHERE $baseWhere
        GROUP BY r.ReportID, r.ActivityDate, r.ReportWriterID, w.PersonID, w.FirstName, w.LastName
        ORDER BY r.ReportID DESC
    ");
    $stmt->execute($baseParams);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $reports = array_map(static function (array $row): array {
        $others = $row['OtherMembers'] !== null && $row['OtherMembers'] !== ''
            ? array_values(array_filter(array_map('trim', explode(',', $row['OtherMembers']))))
            : [];
        return [
            'reportId'        => (int) $row['ReportID'],
            'activityDate'    => $row['ActivityDate'],
            'writerName'      => $row['WriterName'] ?? null,
            'otherMembers'    => $others,
            'hikersSeen'      => (int) $row['HikersSeen'],
            'hikersContacted' => (int) $row['HikersContacted'],
            'treesCleared'    => (int) $row['TreesCleared'],
        ];
    }, $rows);

    jsonOut([
        'reports'    => $reports,
        'totalCount' => count($reports),
    ]);

} catch (Throwable $e) {
    error_log('reports/list.php: ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
    jsonOut(['error' => 'Failed to load reports', 'reports' => [], 'totalCount' => 0], 500);
}
