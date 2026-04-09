<?php
// TEMPORARY — delete after use
require_once __DIR__ . '/config.php';
header('Content-Type: application/json');

$db = getDb();

$sizes = $db->query("
    SELECT TreeSize, COUNT(*) AS cnt
    FROM t_rpt_tree_down
    GROUP BY TreeSize
    ORDER BY TreeSize
")->fetchAll(PDO::FETCH_ASSOC);

echo json_encode($sizes, JSON_PRETTY_PRINT);
