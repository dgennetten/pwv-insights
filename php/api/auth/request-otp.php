<?php
require_once __DIR__ . '/../config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$body  = json_decode(file_get_contents('php://input'), true) ?? [];
$email = strtolower(trim($body['email'] ?? ''));

// Always return 200 — never reveal whether the email exists.
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
  jsonOut(['ok' => true]);
}

$db   = getDb();
$stmt = $db->prepare(
  'SELECT PersonID FROM t_member WHERE LOWER(EmailAddress) = ? LIMIT 1'
);
$stmt->execute([$email]);

if (!$stmt->fetch()) {
  // Email not in t_member — silently do nothing
  jsonOut(['ok' => true]);
}

// Invalidate any existing unused codes for this email
$db->prepare('UPDATE otp_codes SET used = 1 WHERE email = ? AND used = 0')
   ->execute([$email]);

// Generate and store a 6-digit code (expires in OTP_TTL_MINUTES)
$code      = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
$expiresAt = date('Y-m-d H:i:s', strtotime('+' . OTP_TTL_MINUTES . ' minutes'));

$db->prepare('INSERT INTO otp_codes (email, code, expires_at) VALUES (?, ?, ?)')
   ->execute([$email, $code, $expiresAt]);

// Send the code
$subject = 'Your PWV Insights sign-in code';
$message = "Your one-time sign-in code is:\n\n    {$code}\n\nIt expires in " . OTP_TTL_MINUTES . " minutes.\n\nIf you didn't request this, you can ignore this email.";

sendOtpMail($email, $subject, $message);

jsonOut(['ok' => true]);
