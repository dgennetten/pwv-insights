<?php
require_once __DIR__ . '/../config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  jsonOut(['success' => false, 'error' => 'Method not allowed'], 405);
}

$body = json_decode(file_get_contents('php://input'), true) ?? [];

// Honeypot — bots only
if (trim((string) ($body['website'] ?? '')) !== '') {
  jsonOut(['success' => true]);
}

$message = trim((string) ($body['message'] ?? ''));
$name    = trim((string) ($body['name'] ?? ''));
$email   = strtolower(trim((string) ($body['email'] ?? '')));
$token   = trim((string) ($body['token'] ?? ''));

if ($message === '') {
  jsonOut(['success' => false, 'error' => 'Message is required'], 400);
}
if (strlen($message) > 8000) {
  jsonOut(['success' => false, 'error' => 'Message is too long'], 400);
}
if (strlen($name) > 200) {
  jsonOut(['success' => false, 'error' => 'Name is too long'], 400);
}
if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
  jsonOut(['success' => false, 'error' => 'Invalid email address'], 400);
}

$memberContext = '';
if ($token !== '' && strlen($token) === 64 && ctype_xdigit($token)) {
  try {
    $db = getDb();
    $stmt = $db->prepare(
      'SELECT s.person_id, s.expires_at, m.FirstName, m.LastName, m.EmailAddress
       FROM auth_sessions s
       JOIN t_member m ON m.PersonID = s.person_id
       WHERE s.token = ?
       LIMIT 1'
    );
    $stmt->execute([$token]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row && strtotime((string) $row['expires_at']) >= time()) {
      $pid = (int) $row['person_id'];
      $full = trim($row['FirstName'] . ' ' . $row['LastName']);
      $acct = strtolower(trim($row['EmailAddress'] ?? ''));
      $memberContext = "Signed-in member: {$full} (PersonID {$pid}" . ($acct !== '' ? ", {$acct}" : '') . ')';
    }
  } catch (Throwable $e) {
    error_log('feedback send session lookup: ' . $e->getMessage());
  }
}

$lines = [
  'PWV Insights — feedback from About page',
  'Submitted: ' . date('Y-m-d H:i:s T'),
  '',
  $message,
  '',
];
if ($name !== '') {
  $lines[] = 'Name: ' . $name;
}
if ($email !== '') {
  $lines[] = 'Reply-to: ' . $email;
}
if ($memberContext !== '') {
  $lines[] = $memberContext;
}

$subject = 'PWV Insights Feedback';
$replyTo = $email !== '' ? $email : null;

$ok = sendOtpMail(ADMIN_EMAIL, $subject, implode("\n", $lines), $replyTo, false);
if (!$ok) {
  jsonOut(['success' => false, 'error' => 'Could not send feedback. Please try again later.'], 500);
}

jsonOut(['success' => true]);
