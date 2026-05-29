<?php
require_once __DIR__ . '/../config.php';

header('Cache-Control: no-store, no-cache, must-revalidate');

$username = trim($_GET['username'] ?? '');
$group    = trim($_GET['group']    ?? '');
$ticket   = trim($_GET['ticket']   ?? '');

$secrets   = getSecrets();
$ssoSecret = $secrets['pwv_sso_secret'] ?? null;

if (!$ssoSecret) {
    error_log('sso.php: pwv_sso_secret not configured in config.secret.php');
    header('Location: /'); exit;
}

if ($username === '' || $group === '' || strlen($ticket) !== 32 || !ctype_xdigit($ticket)) {
    error_log("sso.php: bad params username=$username group=$group ticket=" . substr($ticket, 0, 8));
    header('Location: /'); exit;
}

// Validate 16-second ticket window (current bracket + previous, matching Fred's algorithm)
$now   = time();
$valid = false;
foreach ([0, -0x10] as $offset) {
    $ts = strval(($now + $offset) & 0xFFFFFFF0);
    if (hash('md4', "$username $group $ssoSecret $ts") === $ticket) {
        $valid = true;
        break;
    }
}

if (!$valid) {
    error_log("sso.php: ticket mismatch for username=$username group=$group");
    header('Location: /'); exit;
}

try {
    $db = getDb();

    $stmt = $db->prepare(
        'SELECT PersonID, FirstName, LastName, EmailAddress
         FROM t_member WHERE LOWER(Username) = ? LIMIT 1'
    );
    $stmt->execute([strtolower($username)]);
    $member = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;

    if (!$member) {
        error_log("sso.php: no t_member row for username=$username");
        header('Location: /'); exit;
    }

    $token     = bin2hex(random_bytes(32));
    $expiresAt = date('Y-m-d H:i:s', strtotime('+365 days'));
    $db->prepare('INSERT INTO auth_sessions (person_id, token, expires_at) VALUES (?, ?, ?)')
       ->execute([$member['PersonID'], $token, $expiresAt]);

    authLoginLogRecord($db, (int) $member['PersonID'], 'AUTO');
    memberLastLoginTouch($db, (int) $member['PersonID']);
    syncRequestPullFromAwsIfStale($db);

    header('Location: /?sso_token=' . urlencode($token));
    exit;

} catch (Throwable $e) {
    error_log('sso.php: ' . $e->getMessage() . ' @' . $e->getFile() . ':' . $e->getLine());
    header('Location: /'); exit;
}
