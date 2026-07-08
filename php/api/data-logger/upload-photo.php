<?php
// Stores a single Data Logger photo up front so the report POST stays small
// (14 base64 photos in one request overflow post_max_size). Returns its URL.
require_once __DIR__ . '/../config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  jsonOut(['success' => false, 'error' => 'Method not allowed'], 405);
}

$body    = json_decode(file_get_contents('php://input'), true) ?? [];
$photoId = preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($body['photoId'] ?? ''));
$raw     = (string) ($body['photoData'] ?? '');

if ($photoId === '' || $raw === '') {
  jsonOut(['success' => false, 'error' => 'Missing photo'], 400);
}
if (preg_match('#^data:image/[\w.+-]+;base64,#', $raw)) {
  $raw = substr($raw, strpos($raw, ',') + 1);
}
$bin = base64_decode($raw, true);
if ($bin === false || strlen($bin) < 100) {
  jsonOut(['success' => false, 'error' => 'Invalid image data'], 400);
}
if (strlen($bin) > 8 * 1024 * 1024) {
  jsonOut(['success' => false, 'error' => 'Image too large'], 413);
}

$photosDir = dirname(dirname(dirname(__DIR__))) . '/data-logger/photos';
if (!is_dir($photosDir)) @mkdir($photosDir, 0755, true);

$fname = "p_{$photoId}.jpg";
if (!is_dir($photosDir) || @file_put_contents($photosDir . '/' . $fname, $bin) === false) {
  jsonOut(['success' => false, 'error' => 'Could not save photo'], 500);
}

jsonOut([
  'success' => true,
  'file'    => $fname,
  'url'     => "/api/data-logger/get-photo.php?file={$fname}",
]);
