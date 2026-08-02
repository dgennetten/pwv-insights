<?php
/**
 * AI Trip Summary — exact tallies (computed here) + an upbeat, newsletter-style
 * day-by-day narrative written by Claude, for a user-selected set of reports.
 * POST body: { token, reportIds: number[] }
 *
 * The app renders the numeric totals; the AI writes prose only, so tallies are
 * always exact regardless of the model.
 */
require_once __DIR__ . '/../config.php';

define('TRIP_PWV_GROUP', 10);
define('TRIP_MAX_REPORTS', 60);
define('TRIP_CACHE_EXPIRY_MONTHS', 12);

/** Best-effort last-modified column on t_report (schema varies); null when none exists. */
function tripReportsModifiedColumn(PDO $db): ?string {
    static $resolved = 'unset';
    if ($resolved !== 'unset') return $resolved;
    foreach (['ModifiedDate', 'DateModified', 'LastModified', 'LastModifiedDate', 'LastUpdated',
              'UpdatedAt', 'ModifiedOn', 'ChangeDate', 'DateChanged', 'EditDate'] as $c) {
        try {
            $db->query("SELECT `$c` FROM `t_report` LIMIT 0");
            return $resolved = $c;
        } catch (Throwable $e) { /* try next */ }
    }
    return $resolved = null;
}

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonOut(['error' => 'Method not allowed'], 405);
}

/** Comma-separated brush/limbing TrailClearingIDs to exclude from tree totals (default 6,7,8). */
function tripBrushIdList(): string {
    $ids = getSecrets()['trail_clearing_brush_ids'] ?? [6, 7, 8];
    if (!is_array($ids) || empty($ids)) return '-1';
    return implode(',', array_map('intval', $ids));
}

/** Tree size classes: TrailClearingID 1–5 → inch-range label (small → XXL). */
function tripSizeLabels(): array {
    return [1 => '< 8"', 2 => '8"–15"', 3 => '16"–23"', 4 => '24"–36"', 5 => '> 36"'];
}

function tripEnsureCacheTable(PDO $db): void {
    try {
        $db->exec(
            'CREATE TABLE IF NOT EXISTS reports_trip_summary (
              report_ids_hash CHAR(40)  NOT NULL,
              narrative       TEXT      NOT NULL,
              generated_at    DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (report_ids_hash)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
        );
    } catch (Throwable $e) {
        error_log('reports_trip_summary ensure: ' . $e->getMessage());
    }
}

try {
    $body  = json_decode(file_get_contents('php://input'), true) ?? [];
    $token = trim($body['token'] ?? '');
    $rawIds = is_array($body['reportIds'] ?? null) ? $body['reportIds'] : [];

    if ($token === '' || strlen($token) !== 64 || !ctype_xdigit($token)) {
        jsonOut(['error' => 'Invalid token'], 401);
    }

    // Dedupe / sanitize report ids
    $ids = [];
    foreach ($rawIds as $v) {
        $n = (int) $v;
        if ($n >= 1) $ids[$n] = true;
    }
    $ids = array_keys($ids);
    sort($ids);
    if (empty($ids)) jsonOut(['error' => 'No reports selected'], 400);
    if (count($ids) > TRIP_MAX_REPORTS) {
        jsonOut(['error' => 'Too many reports selected (max ' . TRIP_MAX_REPORTS . ')'], 400);
    }

    $db = getDb();

    // ── Auth: any valid, unexpired session ────────────────────────────────────
    $sessStmt = $db->prepare('SELECT expires_at FROM auth_sessions WHERE token = ? LIMIT 1');
    $sessStmt->execute([$token]);
    $sess = $sessStmt->fetch(PDO::FETCH_ASSOC);
    if (!$sess) jsonOut(['error' => 'Unknown session'], 401);
    $exp = strtotime($sess['expires_at']);
    if ($exp === false || $exp < time()) jsonOut(['error' => 'Session expired'], 401);

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $brushIds     = tripBrushIdList();

    // ── Report base rows (validated to PWV group / non-draft) ─────────────────
    $baseSql = "
        SELECT
            r.ReportID,
            r.WksiteID,
            r.ActivityDate,
            r.PatrolExtent,
            r.TrailConditions,
            r.Comment,
            GROUP_CONCAT(DISTINCT CONCAT(m.FirstName, ' ', m.LastName)
                ORDER BY m.LastName, m.FirstName SEPARATOR ', ') AS Members,
            (SELECT GROUP_CONCAT(DISTINCT lt.TrailName ORDER BY lt.TrailName SEPARATOR ', ')
             FROM lu_wksite_trail wt
             JOIN lu_trail lt ON lt.TrailID = wt.TrailID AND (lt.IsRoad IS NULL OR lt.IsRoad = 0)
             WHERE wt.WksiteID = r.WksiteID) AS TrailNames,
            (SELECT WksiteName FROM lu_worksite WHERE WksiteID = r.WksiteID LIMIT 1) AS WksiteName
        FROM t_report r
        LEFT JOIN t_report_member rm ON rm.ReportID = r.ReportID
        LEFT JOIN t_member m         ON m.PersonID  = rm.PersonID
        WHERE r.ReportID IN ($placeholders)
          AND r.GroupID = ?
          AND (r.IsDraft      IS NULL OR r.IsDraft      = 0)
          AND (r.IsUnofficial IS NULL OR r.IsUnofficial = 0)
        GROUP BY r.ReportID, r.WksiteID, r.ActivityDate, r.PatrolExtent, r.TrailConditions, r.Comment
        ORDER BY r.ActivityDate ASC, r.ReportID ASC
    ";
    $baseStmt = $db->prepare($baseSql);
    $baseStmt->execute(array_merge($ids, [TRIP_PWV_GROUP]));
    $rows = $baseStmt->fetchAll(PDO::FETCH_ASSOC);
    if (empty($rows)) jsonOut(['error' => 'No matching reports'], 404);

    // ── Trees by size class (IDs 1–5) per report ─────────────────────────────
    $treeStmt = $db->prepare("
        SELECT ReportID, TrailClearingID, COALESCE(SUM(NumCleared), 0) AS Qty
        FROM t_rpt_trail_clearing
        WHERE ReportID IN ($placeholders) AND TrailClearingID BETWEEN 1 AND 5
        GROUP BY ReportID, TrailClearingID
    ");
    $treeStmt->execute($ids);
    $treesByReport = []; // reportId => [sizeId => qty]
    foreach ($treeStmt->fetchAll(PDO::FETCH_ASSOC) as $t) {
        $treesByReport[(int)$t['ReportID']][(int)$t['TrailClearingID']] = (int)$t['Qty'];
    }

    // ── Brushing feet (brush IDs) per report ─────────────────────────────────
    $brushStmt = $db->prepare("
        SELECT ReportID, COALESCE(SUM(NumCleared), 0) AS Ft
        FROM t_rpt_trail_clearing
        WHERE ReportID IN ($placeholders) AND TrailClearingID IN ($brushIds)
        GROUP BY ReportID
    ");
    $brushStmt->execute($ids);
    $brushByReport = [];
    foreach ($brushStmt->fetchAll(PDO::FETCH_ASSOC) as $b) {
        $brushByReport[(int)$b['ReportID']] = (int)$b['Ft'];
    }

    // ── Aggregate ─────────────────────────────────────────────────────────────
    $sizeLabels    = tripSizeLabels();
    $treesBySize   = [1 => 0, 2 => 0, 3 => 0, 4 => 0, 5 => 0];
    $totalBrushing = 0;
    $byTrail       = []; // wksiteId => ['trailName' => ..., 'trees' => n]
    $days          = []; // AI input

    foreach ($rows as $r) {
        $rid  = (int) $r['ReportID'];
        $wks  = (int) $r['WksiteID'];
        $sizes = $treesByReport[$rid] ?? [];
        $reportTrees = 0;
        foreach ($treesBySize as $sid => $_) {
            $q = (int)($sizes[$sid] ?? 0);
            $treesBySize[$sid] += $q;
            $reportTrees += $q;
        }
        $brush = (int)($brushByReport[$rid] ?? 0);
        $totalBrushing += $brush;

        $trailName = trim((string)($r['TrailNames'] ?? '')) !== ''
            ? $r['TrailNames']
            : (trim((string)($r['WksiteName'] ?? '')) !== '' ? $r['WksiteName'] : 'Unknown trail');

        if (!isset($byTrail[$wks])) $byTrail[$wks] = ['trailName' => $trailName, 'trees' => 0];
        $byTrail[$wks]['trees'] += $reportTrees;

        $days[] = [
            'date'      => $r['ActivityDate'],
            'trail'     => $trailName,
            'trees'     => $reportTrees,
            'brushingFt'=> $brush,
            'members'   => trim((string)($r['Members'] ?? '')),
            'extent'    => trim((string)($r['PatrolExtent']    ?? '')),
            'conditions'=> trim((string)($r['TrailConditions'] ?? '')),
            'comment'   => trim((string)($r['Comment']         ?? '')),
        ];
    }

    $totalTrees = array_sum($treesBySize);
    $treesBySizeOut = [];
    foreach ($sizeLabels as $sid => $label) {
        $treesBySizeOut[] = ['sizeClass' => $label, 'count' => (int)$treesBySize[$sid]];
    }
    $byTrailOut = array_values(array_map(function ($t) {
        return ['trailName' => $t['trailName'], 'trees' => (int)$t['trees']];
    }, $byTrail));
    usort($byTrailOut, function ($a, $b) { return $b['trees'] <=> $a['trees']; });

    $totals = [
        'totalTrees'      => (int)$totalTrees,
        'treesBySize'     => $treesBySizeOut,
        'totalBrushingFt' => (int)$totalBrushing,
        'byTrail'         => $byTrailOut,
        'reportCount'     => count($rows),
        'dayCount'        => count(array_unique(array_map(function ($d) { return $d['date']; }, $days))),
    ];

    // ── Narrative (cached by the selected-set hash) ───────────────────────────
    tripEnsureCacheTable($db);
    $cacheHash = sha1(implode(',', $ids));

    // Expiry: a cached narrative older than TRIP_CACHE_EXPIRY_MONTHS is treated as a miss.
    $cachedStmt = $db->prepare(
        'SELECT narrative, generated_at FROM reports_trip_summary
         WHERE report_ids_hash = ?
           AND generated_at >= (NOW() - INTERVAL ' . (int) TRIP_CACHE_EXPIRY_MONTHS . ' MONTH)'
    );
    $cachedStmt->execute([$cacheHash]);
    $cached = $cachedStmt->fetch(PDO::FETCH_ASSOC);

    // Edited-since: invalidate if any selected report was modified after the cache was generated.
    if ($cached) {
        $modifiedCol = tripReportsModifiedColumn($db);
        if ($modifiedCol !== null) {
            $mStmt = $db->prepare("SELECT MAX(`$modifiedCol`) FROM t_report WHERE ReportID IN ($placeholders)");
            $mStmt->execute($ids);
            $lastEdited = $mStmt->fetchColumn();
            if ($lastEdited && strtotime((string) $lastEdited) > strtotime((string) $cached['generated_at'])) {
                $cached = false; // stale — fall through and regenerate
            }
        }
    }

    if ($cached) {
        jsonOut(['totals' => $totals, 'narrative' => $cached['narrative'],
                 'generatedAt' => $cached['generated_at'], 'cached' => true]);
    }

    if (empty(llmProvidersAll())) {
        jsonOut(['totals' => $totals, 'narrative' => null, 'reason' => 'ai_not_configured'], 200);
    }

    // Build per-day prompt material
    $dayParts = [];
    foreach ($days as $d) {
        $lines = ['Date: ' . $d['date'] . ' — Trail: ' . $d['trail']];
        if ($d['members'])    $lines[] = 'Volunteers: ' . $d['members'];
        if ($d['trees'] > 0)  $lines[] = 'Trees cleared: ' . $d['trees'];
        if ($d['brushingFt'] > 0) $lines[] = 'Brushing: ' . $d['brushingFt'] . ' ft';
        if ($d['extent'])     $lines[] = 'Area covered: ' . $d['extent'];
        if ($d['conditions']) $lines[] = 'Trail conditions: ' . $d['conditions'];
        if ($d['comment'])    $lines[] = 'Notes: ' . $d['comment'];
        $dayParts[] = implode("\n", $lines);
    }
    $daysText = implode("\n\n---\n\n", $dayParts);

    $prompt = "You are writing the \"Daily Adventure\" section of a trip recap for Poudre Wilderness "
        . "Volunteers (PWV), whose members patrol wilderness trails in the Canyon Lakes Ranger District, "
        . "Colorado. This recap will appear in a newsletter to inspire other members to get out and "
        . "participate.\n\n"
        . "Here are the patrols on this trip, in order:\n\n" . $daysText . "\n\n"
        . "Write an upbeat, adventure-forward day-by-day narrative. Guidelines:\n"
        . "- One short, lively paragraph per patrol day (combine patrols that share a date), each "
        . "starting with the date and the trail name(s).\n"
        . "- Weave in the real observations, conditions, and notable moments provided; credit the "
        . "volunteers by name where it reads naturally.\n"
        . "- Warm, inviting, newsletter tone that makes readers want to join the next outing.\n"
        . "- Do NOT invent facts, weather, or wildlife that aren't in the notes. Do NOT restate overall "
        . "totals or statistics (those are shown separately). No preamble or sign-off — just the daily paragraphs.";

    $narrative = llmComplete($db, $prompt, 1200)['text'];
    if ($narrative === null) {
        jsonOut(['totals' => $totals, 'narrative' => null, 'error' => 'AI service unavailable'], 200);
    }

    $db->prepare(
        'INSERT INTO reports_trip_summary (report_ids_hash, narrative, generated_at)
         VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE narrative = VALUES(narrative), generated_at = NOW()'
    )->execute([$cacheHash, $narrative]);

    jsonOut(['totals' => $totals, 'narrative' => $narrative, 'generatedAt' => date('c'), 'cached' => false]);

} catch (Throwable $e) {
    error_log('reports/trip-summary.php: ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
    jsonOut(['error' => 'Server error'], 500);
}
