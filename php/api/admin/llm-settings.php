<?php
/**
 * Admin: read / set the global primary AI provider (applies to all users, all
 * sessions). Unselected configured providers act as automatic fallbacks.
 *
 * POST { token }           → { success, providers: [{id,label,model}], primary }
 * POST { token, primary }  → same shape, after storing app_settings.llm_primary
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
$token = trim($body['token'] ?? '');
if ($token === '' || strlen($token) !== 64 || !ctype_xdigit($token)) {
  jsonOut(['success' => false, 'error' => 'Invalid token'], 401);
}

$db = getDb();

// ── Admin auth (session token → EmailAddress must equal ADMIN_EMAIL) ──────────
$stmt = $db->prepare(
  'SELECT s.expires_at, m.EmailAddress
   FROM auth_sessions s
   JOIN t_member m ON m.PersonID = s.person_id
   WHERE s.token = ? LIMIT 1'
);
$stmt->execute([$token]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$row) jsonOut(['success' => false, 'error' => 'Unknown session'], 401);
$exp = strtotime($row['expires_at']);
if ($exp === false || $exp < time()) jsonOut(['success' => false, 'error' => 'Session expired'], 401);
if (strtolower(trim($row['EmailAddress'])) !== strtolower(ADMIN_EMAIL)) {
  jsonOut(['success' => false, 'error' => 'Forbidden'], 403);
}

$all = llmProvidersAll(); // id => provider (only those with a configured key)

// ── Set (when a primary is supplied) ──────────────────────────────────────────
if (array_key_exists('primary', $body)) {
  $primary = trim((string) $body['primary']);
  if (!isset($all[$primary])) {
    jsonOut(['success' => false, 'error' => 'Unknown or unconfigured provider'], 400);
  }
  appSettingSet($db, 'llm_primary', $primary);
}

// ── Read effective state ──────────────────────────────────────────────────────
$providers = array_values(array_map(function ($p) {
  return ['id' => $p['id'], 'label' => $p['label'], 'model' => $p['model']];
}, $all));

$primary = appSettingGet($db, 'llm_primary', null);
if ($primary === null || !isset($all[$primary])) {
  $primary = $providers[0]['id'] ?? null; // effective default = first configured provider
}

jsonOut(['success' => true, 'providers' => $providers, 'primary' => $primary]);
