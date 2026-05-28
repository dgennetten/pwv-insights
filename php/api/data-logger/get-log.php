<?php
require_once __DIR__ . '/../config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$id = trim($_GET['id'] ?? '');

if (!preg_match('/^trailLog\.[0-9]+$/', $id)) {
  jsonOut(['success' => false, 'error' => 'Invalid log ID'], 400);
}

$dataLoggerDir = dirname(dirname(dirname(__DIR__))) . '/data-logger';
$filePath      = $dataLoggerDir . '/' . $id . '.json';

if (!file_exists($filePath)) {
  jsonOut(['success' => false, 'error' => 'Log not found'], 404);
}

$raw = @file_get_contents($filePath);
if ($raw === false) {
  jsonOut(['success' => false, 'error' => 'Could not read log'], 500);
}

$log = json_decode($raw, true);
if (!is_array($log)) {
  jsonOut(['success' => false, 'error' => 'Malformed log file'], 500);
}

jsonOut(['success' => true, 'log' => $log]);
