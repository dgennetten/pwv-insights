<?php
/**
 * Trial access login — validates an admin-generated trial link token and returns a
 * session-like payload for password/OTC-free access. The 7-day clock starts on the
 * FIRST call for a given token (activated_at / expires_at are stamped then).
 *
 * The token is NOT an auth_sessions row and carries no PersonID, so a trial user can
 * never reach member-only endpoints. Idempotent: repeat calls (page reloads) return
 * the same expiry until it lapses or the link is revoked.
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

$body  = json_decode(file_get_contents('php://input'), true) ?? [];
$token = strtolower(trim($body['token'] ?? ''));

if ($token === '' || strlen($token) !== 64 || !ctype_xdigit($token)) {
  jsonOut(['success' => false, 'error' => 'Invalid trial link'], 401);
}

try {
  $db = getDb();
  trialLinksEnsureTable($db);

  $stmt = $db->prepare(
    'SELECT id, activated_at, expires_at, revoked FROM trial_links WHERE token = ? LIMIT 1'
  );
  $stmt->execute([$token]);
  $link = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;

  if (!$link) {
    jsonOut(['success' => false, 'error' => 'Trial link not found'], 401);
  }
  if ((int) $link['revoked'] === 1) {
    jsonOut(['success' => false, 'error' => 'This trial link has been revoked'], 403);
  }

  if ($link['activated_at'] === null) {
    // First open — start the 7-day clock now.
    $expiresAt = date('Y-m-d H:i:s', strtotime('+' . TRIAL_DAYS . ' days'));
    $db->prepare(
      'UPDATE trial_links
       SET activated_at = NOW(), expires_at = ?, use_count = use_count + 1, last_used_at = NOW()
       WHERE id = ?'
    )->execute([$expiresAt, $link['id']]);
  } else {
    $expiresAt = (string) $link['expires_at'];
    $expiresTs = strtotime($expiresAt);
    if ($expiresTs === false || $expiresTs < time()) {
      jsonOut(['success' => false, 'error' => 'This trial has expired', 'expired' => true], 403);
    }
    $db->prepare('UPDATE trial_links SET use_count = use_count + 1, last_used_at = NOW() WHERE id = ?')
       ->execute([$link['id']]);
  }

  $expiresTs = strtotime($expiresAt) ?: (time() + TRIAL_DAYS * 86400);

  jsonOut([
    'success'   => true,
    'token'     => $token,
    'email'     => '',
    'name'      => 'Trial Guest',
    'role'      => 'trial',
    'personId'  => 0,
    'expiresAt' => $expiresTs * 1000,
    'trialDays' => TRIAL_DAYS,
  ]);

} catch (Throwable $e) {
  error_log('trial-login.php: ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
  jsonOut(['success' => false, 'error' => 'Trial login failed'], 500);
}
