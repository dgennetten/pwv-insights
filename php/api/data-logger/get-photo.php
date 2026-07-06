<?php
// Serves a Data Logger photo from the (non-web-root) data-logger/photos store,
// mirroring how get-log.php serves the JSON logs.

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$file = basename(trim($_GET['file'] ?? ''));

// Only serve our own generated JPEG names — blocks traversal and other types.
if (!preg_match('/^trailLog\.[A-Za-z0-9._-]+\.jpg$/', $file)) {
  http_response_code(400);
  exit;
}

$photosDir = dirname(dirname(dirname(__DIR__))) . '/data-logger/photos';
$path      = $photosDir . '/' . $file;

if (!is_file($path)) {
  http_response_code(404);
  exit;
}

header('Content-Type: image/jpeg');
header('Content-Length: ' . filesize($path));
header('Cache-Control: public, max-age=31536000, immutable');
readfile($path);
