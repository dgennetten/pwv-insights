<?php
require_once __DIR__ . '/../config.php';

define('AI_SUMMARY_PWV_GROUP', 10);
define('AI_SUMMARY_MAX_REPORTS', 3);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function ensureAiSummaryTable(PDO $db): void {
    try {
        $db->exec(
            'CREATE TABLE IF NOT EXISTS trail_ai_summary (
              wksite_id       INT UNSIGNED  NOT NULL,
              report_ids_key  VARCHAR(200)  NOT NULL,
              summary         TEXT          NOT NULL,
              generated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (wksite_id, report_ids_key)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
        );
    } catch (Throwable $e) {
        error_log('trail_ai_summary ensure: ' . $e->getMessage());
    }
}

function fetchRecentReports(PDO $db, int $wksiteId, int $limit): array {
    $stmt = $db->prepare("
        SELECT
            r.ReportID,
            r.ActivityDate,
            COALESCE(
                GROUP_CONCAT(DISTINCT CONCAT(m.FirstName, ' ', m.LastName)
                    ORDER BY m.LastName SEPARATOR ' & '),
                'Unknown'
            ) AS MemberName,
            r.PatrolExtent,
            r.TrailConditions,
            r.Comment
        FROM t_report r
        LEFT JOIN t_report_member rm ON rm.ReportID = r.ReportID
        LEFT JOIN t_member m ON m.PersonID = rm.PersonID
        WHERE r.WksiteID = ?
          AND r.GroupID = ?
          AND (r.IsDraft      IS NULL OR r.IsDraft      = 0)
          AND (r.IsUnofficial IS NULL OR r.IsUnofficial = 0)
        GROUP BY r.ReportID, r.ActivityDate, r.PatrolExtent, r.TrailConditions, r.Comment
        ORDER BY r.ActivityDate DESC
        LIMIT ?
    ");
    $stmt->execute([$wksiteId, AI_SUMMARY_PWV_GROUP, $limit]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function buildPrompt(array $reports, string $trailName): string {
    $parts = [];
    foreach ($reports as $r) {
        $lines = ['Date: ' . $r['ActivityDate'] . ' — ' . $r['MemberName']];
        $extent     = trim($r['PatrolExtent']    ?? '');
        $conditions = trim($r['TrailConditions'] ?? '');
        $comment    = trim($r['Comment']         ?? '');
        if ($extent)     $lines[] = 'Area covered: '     . $extent;
        if ($conditions) $lines[] = 'Trail conditions: ' . $conditions;
        if ($comment)    $lines[] = 'Notes: '            . $comment;
        if (count($lines) > 1) $parts[] = implode("\n", $lines);
    }

    if (empty($parts)) {
        // Reports exist but have no narrative text — fall through to no_narrative response
        return '';
    }

    $reportsText = implode("\n\n---\n\n", $parts);
    $n = count($parts);

    return "You are summarizing patrol reports for Poudre Wilderness Volunteers (PWV), "
         . "a volunteer organization that patrols wilderness trails in the Canyon Lakes Ranger District, Colorado.\n\n"
         . "Here are the {$n} most recent patrol reports for the trail \"{$trailName}\":\n\n"
         . $reportsText . "\n\n"
         . "Write a concise 2–3 sentence summary of current trail conditions and notable observations. "
         . "Focus on practical information: trail conditions, hazards, wildlife, visitor behavior, maintenance needs. "
         . "Be specific and factual. Do not mention dates, volunteer names, or how many reports you reviewed.";
}

function callClaude(string $apiKey, string $prompt): ?string {
    $payload = json_encode([
        'model'      => 'claude-haiku-4-5-20251001',
        'max_tokens' => 250,
        'messages'   => [['role' => 'user', 'content' => $prompt]],
    ]);

    $ch = curl_init('https://api.anthropic.com/v1/messages');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'x-api-key: ' . $apiKey,
            'anthropic-version: 2023-06-01',
        ],
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_TIMEOUT    => 20,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200 || !$response) {
        error_log('Claude API error: HTTP ' . $httpCode . ' ' . substr((string)($response ?: ''), 0, 200));
        return null;
    }

    $data = json_decode($response, true);
    return $data['content'][0]['text'] ?? null;
}

try {
    $wksiteId = (int)($_GET['wksiteId'] ?? 0);
    if ($wksiteId <= 0) jsonOut(['error' => 'Missing wksiteId'], 400);

    $secrets = getSecrets();
    $apiKey  = trim($secrets['claude_api_key'] ?? '');
    if (empty($apiKey)) jsonOut(['error' => 'AI summaries not configured'], 503);

    $db = getDb();
    ensureAiSummaryTable($db);

    // Trail name for the prompt
    $nameStmt = $db->prepare('SELECT WksiteName FROM lu_wksite WHERE WksiteID = ? LIMIT 1');
    $nameStmt->execute([$wksiteId]);
    $trailName = (string)($nameStmt->fetchColumn() ?: 'this trail');

    // Fetch last N reports with narrative text
    $reports = fetchRecentReports($db, $wksiteId, AI_SUMMARY_MAX_REPORTS);
    if (empty($reports)) jsonOut(['summary' => null, 'reason' => 'no_reports']);

    $reportIds = array_map(fn($r) => (int)$r['ReportID'], $reports);
    sort($reportIds);
    $cacheKey = implode(',', $reportIds);

    // Return cached summary if the report set hasn't changed
    $cachedStmt = $db->prepare(
        'SELECT summary, generated_at FROM trail_ai_summary WHERE wksite_id = ? AND report_ids_key = ?'
    );
    $cachedStmt->execute([$wksiteId, $cacheKey]);
    $cached = $cachedStmt->fetch(PDO::FETCH_ASSOC);
    if ($cached) {
        jsonOut(['summary' => $cached['summary'], 'generatedAt' => $cached['generated_at'],
                 'reportIds' => $reportIds, 'cached' => true]);
    }

    // Build prompt and check for narrative content
    $prompt = buildPrompt($reports, $trailName);
    if (empty($prompt)) jsonOut(['summary' => null, 'reason' => 'no_narrative']);

    // Call Claude
    $summary = callClaude($apiKey, $prompt);
    if ($summary === null) jsonOut(['error' => 'AI service unavailable'], 503);

    // Cache the result
    $db->prepare(
        'INSERT INTO trail_ai_summary (wksite_id, report_ids_key, summary, generated_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE summary = VALUES(summary), generated_at = NOW()'
    )->execute([$wksiteId, $cacheKey, $summary]);

    jsonOut(['summary' => $summary, 'generatedAt' => date('c'), 'reportIds' => $reportIds, 'cached' => false]);

} catch (Throwable $e) {
    error_log('ai-summary.php: ' . $e->getMessage());
    jsonOut(['error' => 'Server error'], 500);
}
