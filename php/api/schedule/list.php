<?php
require_once __DIR__ . '/../config.php';

define('SCHEDULE_PWV_GROUP', 10);

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

try {
    $db = getDb();

    // memberContext: required PersonID
    $rawCtx   = $_GET['memberContext'] ?? '';
    $personId = null;
    if ($rawCtx !== '' && $rawCtx !== 'all') {
        $n = (int) $rawCtx;
        if ($n >= 1) $personId = $n;
    }
    if ($personId === null) {
        jsonOut(['error' => 'memberContext is required', 'schedules' => [], 'totalCount' => 0, 'members' => []], 400);
    }

    // view: upcoming (ActivityDate >= today) or completed (ActivityDate < today)
    $view      = (($_GET['view'] ?? 'upcoming') === 'completed') ? 'completed' : 'upcoming';
    $dateOp    = $view === 'upcoming' ? '>=' : '<';
    $dateOrder = $view === 'upcoming' ? 'ASC' : 'DESC';

    $stmt = $db->prepare("
        SELECT
            s.ScheduleID,
            s.ActivityDate,
            s.WksiteID,
            w.WksiteName,
            atype.ActTypeName,
            am.ActMethodName,
            CONCAT(sched.FirstName, ' ', sched.LastName)         AS SchedulerName,
            s.ReportID,
            GROUP_CONCAT(
                DISTINCT CONCAT(m.FirstName, ' ', m.LastName)
                ORDER BY m.LastName, m.FirstName
                SEPARATOR ', '
            ) AS MembersStr
        FROM t_schedule s
        LEFT JOIN lu_worksite w         ON w.WksiteID      = s.WksiteID
        LEFT JOIN lu_activity_type atype ON atype.ActTypeID   = s.ActTypeID
        LEFT JOIN lu_activity_method am  ON am.ActMethodID   = s.ActMethodID
        LEFT JOIN t_member sched        ON sched.PersonID  = s.SchedulerID
        LEFT JOIN t_schedule_member sm  ON sm.ScheduleID   = s.ScheduleID
        LEFT JOIN t_member m            ON m.PersonID      = sm.PersonID
        WHERE s.GroupID = ?
          AND s.ActivityDate $dateOp CURDATE()
          AND (
              s.SchedulerID = ?
              OR EXISTS (
                  SELECT 1 FROM t_schedule_member smf
                  WHERE smf.ScheduleID = s.ScheduleID AND smf.PersonID = ?
              )
          )
        GROUP BY s.ScheduleID, s.ActivityDate, s.WksiteID, w.WksiteName, atype.ActTypeName, am.ActMethodName,
                 sched.FirstName, sched.LastName, s.ReportID
        ORDER BY s.ActivityDate $dateOrder, s.ScheduleID $dateOrder
    ");
    $stmt->execute([SCHEDULE_PWV_GROUP, $personId, $personId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $schedules = array_map(static function (array $row): array {
        $members = [];
        if ($row['MembersStr'] !== null && $row['MembersStr'] !== '') {
            $members = array_values(array_filter(array_map('trim', explode(',', $row['MembersStr']))));
        }
        return [
            'scheduleId'    => (int) $row['ScheduleID'],
            'activityDate'  => $row['ActivityDate'],
            'wksiteId'      => $row['WksiteID'] !== null ? (int)$row['WksiteID'] : null,
            'wksiteName'    => $row['WksiteName']    ?? null,
            'activityType'  => $row['ActTypeName']   ?? null,
            'activityMethod'=> $row['ActMethodName'] ?? null,
            'schedulerName' => $row['SchedulerName'] ?? null,
            'reportId'      => $row['ReportID'] !== null ? (int)$row['ReportID'] : null,
            'members'       => $members,
        ];
    }, $rows);

    // Members list for dropdown — everyone who appears as a scheduler OR a listed member
    $membersStmt = $db->prepare("
        SELECT
            m.PersonID  AS personId,
            m.FirstName AS firstName,
            m.LastName  AS lastName,
            CONCAT(m.FirstName, ' ', m.LastName) AS fullName,
            COUNT(DISTINCT combined.ScheduleID) AS scheduleCount
        FROM t_member m
        JOIN (
            SELECT sm.PersonID, sm.ScheduleID
            FROM t_schedule_member sm
            JOIN t_schedule s ON s.ScheduleID = sm.ScheduleID AND s.GroupID = ? AND s.ActivityDate $dateOp CURDATE()
            UNION
            SELECT s.SchedulerID AS PersonID, s.ScheduleID
            FROM t_schedule s
            WHERE s.GroupID = ? AND s.ActivityDate $dateOp CURDATE()
        ) combined ON combined.PersonID = m.PersonID
        GROUP BY m.PersonID, m.FirstName, m.LastName
        ORDER BY scheduleCount DESC, m.LastName, m.FirstName
    ");
    $membersStmt->execute([SCHEDULE_PWV_GROUP, SCHEDULE_PWV_GROUP]);
    $members = array_map(static function (array $m): array {
        return [
            'personId'      => (int) $m['personId'],
            'firstName'     => $m['firstName'],
            'lastName'      => $m['lastName'],
            'fullName'      => $m['fullName'],
            'scheduleCount' => (int) $m['scheduleCount'],
        ];
    }, $membersStmt->fetchAll(PDO::FETCH_ASSOC));

    jsonOut([
        'schedules'  => $schedules,
        'totalCount' => count($schedules),
        'members'    => $members,
    ]);

} catch (Throwable $e) {
    error_log('schedule/list.php: ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
    jsonOut(['error' => 'Failed to load schedule', 'schedules' => [], 'totalCount' => 0, 'members' => []], 500);
}
