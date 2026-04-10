<?php
// TEMPORARY — delete after use
require_once __DIR__ . '/config.php';
header('Content-Type: application/json');

$db = getDb();

$sizes = $db->query("
    SELECT TrailClearingID,
           COUNT(*) AS row_count,
           COALESCE(SUM(NumCleared), 0) AS sum_qty
    FROM t_rpt_trail_clearing
    GROUP BY TrailClearingID
    ORDER BY TrailClearingID
")->fetchAll(PDO::FETCH_ASSOC);

echo json_encode($sizes, JSON_PRETTY_PRINT);
