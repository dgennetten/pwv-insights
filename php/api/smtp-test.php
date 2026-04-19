<?php
// Run from SSH: php smtp-test.php your@email.com
// DELETE this file after testing — never leave on the server.

$to = $argv[1] ?? null;
if (!$to) { die("Usage: php smtp-test.php recipient@example.com\n"); }

$srcDir = '/home/dgennetten/PHPMailer/src';

if (!file_exists($srcDir . '/PHPMailer.php')) {
  die("ERROR: PHPMailer not found at $srcDir\n");
}

require_once $srcDir . '/Exception.php';
require_once $srcDir . '/PHPMailer.php';
require_once $srcDir . '/SMTP.php';

$mail = new PHPMailer\PHPMailer\PHPMailer(true);
$mail->SMTPDebug = 2; // verbose SMTP transcript
$mail->Debugoutput = 'echo';

try {
  $mail->isSMTP();
  $mail->Host       = 'smtp.dreamhost.com';
  $mail->SMTPAuth   = true;
  $mail->Username   = 'noreply@gennetten.org';
  $mail->Password   = 'td!S1ngular1ty';
  $mail->SMTPSecure = 'tls';
  $mail->Port       = 587;
  $mail->Timeout    = 10;

  $mail->setFrom('noreply@gennetten.org', 'PWV Insights');
  $mail->addAddress($to);
  $mail->Subject = 'SMTP test';
  $mail->Body    = "If you received this, SMTP is working.\n";
  $mail->isHTML(false);

  $mail->send();
  echo "\nSUCCESS: message sent to $to\n";
} catch (PHPMailer\PHPMailer\Exception $e) {
  echo "\nFAILED: " . $e->getMessage() . "\n";
}
