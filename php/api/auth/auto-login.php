<?php
require_once __DIR__ . '/../config.php';

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$body = json_decode(file_get_contents('php://input'), true) ?? [];
$id   = trim($body['id'] ?? $_GET['id'] ?? '');

// Format: <YYYYMMDD 8 chars><PersonID remaining digits>
if (!preg_match('/^\d{9,}$/', $id)) {
    jsonOut(['success' => false, 'error' => 'Invalid token'], 400);
}

$dobStr   = substr($id, 0, 8);
$personId = (int) substr($id, 8);
$dob      = substr($dobStr, 0, 4) . '-' . substr($dobStr, 4, 2) . '-' . substr($dobStr, 6, 2);

if ($personId < 1) {
    jsonOut(['success' => false, 'error' => 'Invalid token'], 400);
}

try {
    $db = getDb();

    $stmt = $db->prepare(
        'SELECT PersonID, FirstName, LastName, EmailAddress
         FROM t_member
         WHERE PersonID = ? AND BirthDate = ?
         LIMIT 1'
    );
    $stmt->execute([$personId, $dob]);
    $member = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;

    if (!$member) {
        jsonOut(['success' => false, 'error' => 'Invalid credentials'], 401);
    }

    $token     = bin2hex(random_bytes(32));
    $expiresAt = date('Y-m-d H:i:s', strtotime('+365 days'));
    $db->prepare('INSERT INTO auth_sessions (person_id, token, expires_at) VALUES (?, ?, ?)')
       ->execute([$member['PersonID'], $token, $expiresAt]);

    authLoginLogRecord($db, (int) $member['PersonID'], 'AUTO');
    memberLastLoginTouch($db, (int) $member['PersonID']);
    syncRequestPullFromAwsIfStale($db);

    $email = strtolower(trim($member['EmailAddress'] ?? ''));
    $role  = ($email !== '' && strtolower($email) === strtolower(ADMIN_EMAIL)) ? 'admin' : 'member';

    $expiresTs = strtotime($expiresAt) ?: (time() + 365 * 86400);

    jsonOut([
        'success'   => true,
        'token'     => $token,
        'email'     => $email,
        'name'      => trim($member['FirstName'] . ' ' . $member['LastName']),
        'role'      => $role,
        'personId'  => (int) $member['PersonID'],
        'expiresAt' => $expiresTs * 1000,
    ]);

} catch (Throwable $e) {
    error_log('auto-login.php: ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
    jsonOut(['success' => false, 'error' => 'Login failed'], 500);
}
