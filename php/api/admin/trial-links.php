<?php
/**
 * Manage trial access links (admin session token required).
 *
 *   { token, action: 'list' }                    → recent links with computed status
 *   { token, action: 'create', label? }          → generate a new link, returns token
 *   { token, action: 'revoke', id }              → revoke a link (blocks future use)
 *   { token, action: 'delete', id }              → permanently remove a link from the log
 */
require_once __DIR__ . '/../config.php';

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  jsonOut(['success' => false, 'error' => 'Method not allowed'], 405);
}

$body   = json_decode(file_get_contents('php://input'), true) ?? [];
$token  = trim($body['token'] ?? '');
$action = trim($body['action'] ?? 'list');

$db = getDb();
$adminId = authResolveAdminPersonId($db, $token);
trialLinksEnsureTable($db);

/** Shape one DB row into the API response with a computed status. */
function trialLinkRow(array $r): array {
  $expiresTs   = $r['expires_at'] !== null ? strtotime((string) $r['expires_at']) : null;
  $activated   = $r['activated_at'] !== null;
  $revoked     = (int) $r['revoked'] === 1;
  $expired     = $expiresTs !== null && $expiresTs < time();

  if ($revoked) {
    $status = 'revoked';
  } elseif (!$activated) {
    $status = 'pending';           // generated, not yet opened
  } elseif ($expired) {
    $status = 'expired';
  } else {
    $status = 'active';
  }

  return [
    'id'          => (int) $r['id'],
    'token'       => (string) $r['token'],
    'label'       => $r['label'] !== null ? (string) $r['label'] : '',
    'createdAtMs' => $r['created_at'] !== null ? (strtotime((string) $r['created_at']) * 1000) : 0,
    'expiresAtMs' => $expiresTs !== null ? $expiresTs * 1000 : 0,
    'useCount'    => (int) $r['use_count'],
    'status'      => $status,
  ];
}

try {
  if ($action === 'create') {
    $label = trim((string) ($body['label'] ?? ''));
    if (mb_strlen($label) > 120) $label = mb_substr($label, 0, 120);

    $newToken = bin2hex(random_bytes(32));
    $db->prepare('INSERT INTO trial_links (token, label, created_by) VALUES (?, ?, ?)')
       ->execute([$newToken, $label !== '' ? $label : null, $adminId]);

    $stmt = $db->prepare('SELECT * FROM trial_links WHERE token = ? LIMIT 1');
    $stmt->execute([$newToken]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    jsonOut(['success' => true, 'link' => trialLinkRow($row ?: [])]);
  }

  if ($action === 'revoke') {
    $id = (int) ($body['id'] ?? 0);
    if ($id < 1) jsonOut(['success' => false, 'error' => 'Invalid id'], 400);
    $db->prepare('UPDATE trial_links SET revoked = 1 WHERE id = ?')->execute([$id]);
    jsonOut(['success' => true]);
  }

  if ($action === 'delete') {
    $id = (int) ($body['id'] ?? 0);
    if ($id < 1) jsonOut(['success' => false, 'error' => 'Invalid id'], 400);
    $db->prepare('DELETE FROM trial_links WHERE id = ?')->execute([$id]);
    jsonOut(['success' => true]);
  }

  // Default: list
  $rows = $db->query('SELECT * FROM trial_links ORDER BY created_at DESC LIMIT 100')
             ->fetchAll(PDO::FETCH_ASSOC);
  $links = array_map('trialLinkRow', $rows);
  jsonOut(['success' => true, 'links' => $links]);

} catch (Throwable $e) {
  error_log('admin/trial-links.php: ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
  jsonOut(['success' => false, 'error' => 'Trial link operation failed'], 500);
}
