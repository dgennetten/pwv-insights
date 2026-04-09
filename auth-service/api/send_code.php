<?php
require_once __DIR__ . '/config.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { jsonOut(['error' => 'Method not allowed'], 405); }

$body      = json_decode(file_get_contents('php://input'), true) ?? [];
$appId     = trim($body['app_id']     ?? '');
$appSecret = trim($body['app_secret'] ?? '');
$email     = trim($body['email']      ?? '');

// Always return 200 — never reveal whether the email or app exists.
if (!$appId || !$appSecret || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
  jsonOut(['ok' => true]);
}

if (!verifyApp($appId, $appSecret)) {
  jsonOut(['ok' => true]);
}

// Generate a 6-digit code and store it
$code      = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
$expiresAt = date('Y-m-d H:i:s', strtotime('+' . OTP_TTL_MINUTES . ' minutes'));

$db = authDb();

// Invalidate any existing unused codes for this app+email
$db->prepare('UPDATE otp_codes SET used = 1 WHERE app_id = ? AND email = ? AND used = 0')
   ->execute([$appId, $email]);

$db->prepare('INSERT INTO otp_codes (app_id, email, code, expires_at) VALUES (?, ?, ?, ?)')
   ->execute([$appId, $email, $code, $expiresAt]);

// Send the email
$subject = 'Your sign-in code';
$message = "Your one-time sign-in code is:\n\n    {$code}\n\nIt expires in " . OTP_TTL_MINUTES . " minutes.\n\nIf you didn't request this, you can ignore this email.";
$headers = "From: " . MAIL_FROM_NAME . " <" . MAIL_FROM . ">\r\n"
         . "Content-Type: text/plain; charset=UTF-8\r\n";

mail($email, $subject, $message, $headers);

jsonOut(['ok' => true]);
