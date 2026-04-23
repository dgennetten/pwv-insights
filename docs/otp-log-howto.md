# OTP Email — Testing & Log Monitoring

## Where the log lives

OTP send results are written to `~/otp.log` on the DreamHost server (one level above the web root — not publicly accessible).

Each line looks like:

```
[2026-04-23 08:16:57 PDT] [OTP-SEND] OK to=douglas@gennetten.com msg-id= elapsed=1158ms
[2026-04-23 08:20:11 PDT] [OTP-SEND] FAIL to=someone@example.com elapsed=10001ms error=SMTP Error: ... detail=...
```

---

## Test an OTP send

### PowerShell
```powershell
Invoke-WebRequest -Method POST `
  -Uri "https://pwv-insights.gennetten.org/api/auth/request-otp.php" `
  -ContentType "application/json" `
  -Body '{"email":"douglas@gennetten.com"}' | Select-Object -ExpandProperty Content
```

Expected response: `{"ok":true}` — always returned regardless of whether the email exists.

### Git Bash / WSL
```bash
curl -s -X POST https://pwv-insights.gennetten.org/api/auth/request-otp.php \
  -H "Content-Type: application/json" \
  -d '{"email":"douglas@gennetten.com"}'
```

---

## Read the log

```powershell
ssh dgennetten@pwv-insights.gennetten.org "cat ~/otp.log"
```

To watch it live while testing:
```powershell
ssh dgennetten@pwv-insights.gennetten.org "tail -f ~/otp.log"
```

To see only failures:
```powershell
ssh dgennetten@pwv-insights.gennetten.org "grep FAIL ~/otp.log"
```

---

## Enable verbose SMTP debug logging

When chasing an intermittent failure, add `'debug' => 2` to the `smtp` block in `php/api/config.secret.php`:

```php
'smtp' => [
    // ...existing keys...
    'debug' => 2,   // 1 = client commands only, 2 = client+server full conversation
],
```

Deploy, reproduce the failure, then check `~/otp.log` for `[OTP-SMTP-DEBUG]` lines showing the full SMTP handshake and server responses. **Remove `debug` when done** — it's verbose.

---

## Escalating to DreamHost support

DreamHost's checklist for escalation: https://help.dreamhost.com/hc/en-us/articles/215030208-Email-troubleshooting-checklist-for-escalation

Gather from `~/otp.log`:
- Timestamp of the failed send
- Recipient address
- The full `FAIL` line including `error=` and `detail=`
- If `debug: 2` was active, the `[OTP-SMTP-DEBUG]` lines around the failure

---

## Deploy

```powershell
npm run build-and-deploy
```

Uses tar+ssh via Git Bash on Windows (rsync preferred if available). SSH key auth is configured — no password prompt.
