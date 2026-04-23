#!/usr/bin/env node
/**
 * Cross-platform deploy — works from PowerShell, cmd, or Git Bash.
 * Env overrides: SSH_USER, SSH_HOST, REMOTE_WEB_ROOT, REMOTE_PHP_ROOT, DEPLOY_USE_TAR=1
 */
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join }   from 'node:path'

const IS_WIN = process.platform === 'win32'

const SSH_USER        = process.env.SSH_USER        ?? 'dgennetten'
const SSH_HOST        = process.env.SSH_HOST        ?? 'pwv-insights.gennetten.org'
const REMOTE_WEB_ROOT = process.env.REMOTE_WEB_ROOT ?? '~/pwv-insights.gennetten.org'
const REMOTE_PHP_ROOT = process.env.REMOTE_PHP_ROOT ?? '~/pwv-insights.gennetten.org/api'
const SSH_TARGET      = `${SSH_USER}@${SSH_HOST}`
const USE_TAR         = process.env.DEPLOY_USE_TAR === '1'

// SSH multiplexing: authenticate once, reuse the socket for all transfers.
// ControlPath uses forward slashes — required by OpenSSH on Windows too.
const CTL_PATH = join(tmpdir(), `pwv-deploy-${process.pid}.ctl`).replace(/\\/g, '/')
const SSH_MUX  = `-o ControlMaster=auto -o ControlPath="${CTL_PATH}" -o ControlPersist=30`

process.on('exit', () => {
  spawnSync('ssh', ['-O', 'exit', '-o', `ControlPath=${CTL_PATH}`, SSH_TARGET], { stdio: 'ignore' })
  try { rmSync(CTL_PATH) } catch { /* already gone */ }
})

function die(msg) { console.error(msg); process.exit(1) }

function run(file, args, opts = {}) {
  const r = spawnSync(file, args, { stdio: 'inherit', ...opts })
  if (r.error) die(`Failed to start '${file}': ${r.error.message}`)
  if (r.status !== 0) process.exit(r.status ?? 1)
}

function canRun(cmd) {
  const r = spawnSync(cmd, ['--version'], { stdio: 'ignore' })
  return !r.error && r.status === 0
}

function findBash() {
  if (!IS_WIN) return 'bash'
  const candidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    ...(process.env.PROGRAMFILES ? [`${process.env.PROGRAMFILES}\\Git\\bin\\bash.exe`]              : []),
    ...(process.env.LOCALAPPDATA ? [`${process.env.LOCALAPPDATA}\\Programs\\Git\\bin\\bash.exe`]    : []),
  ]
  return candidates.find(p => existsSync(p)) ?? null
}

// ── Build ─────────────────────────────────────────────────────────────────────
console.log('▶ Building frontend…')
run('npm', ['run', 'build'], { shell: IS_WIN })
console.log('  ✓ dist/ ready\n')

// ── Transfer ──────────────────────────────────────────────────────────────────
const useRsync = !USE_TAR && canRun('rsync')

if (useRsync) {
  console.log(`▶ Uploading frontend → ${SSH_TARGET}:${REMOTE_WEB_ROOT}/`)
  run('rsync', ['-az', '--delete', '-e', `ssh ${SSH_MUX}`, '--exclude', '.htaccess',
    'dist/', `${SSH_TARGET}:${REMOTE_WEB_ROOT}/`])
  console.log('  ✓ Frontend deployed\n')

  console.log(`▶ Uploading PHP API → ${SSH_TARGET}:${REMOTE_PHP_ROOT}/`)
  run('rsync', ['-az', '-e', `ssh ${SSH_MUX}`,
    '--exclude', 'config.secret.php',
    '--exclude', 'config.secret.example.php',
    'php/api/', `${SSH_TARGET}:${REMOTE_PHP_ROOT}/`])
  console.log('  ✓ PHP deployed (config.secret.php untouched)\n')

} else {
  const bash = findBash()
  if (!bash) {
    die([
      'ERROR: rsync not found and no bash available.',
      '  Options:',
      '    • choco install rsync   (then re-run)',
      '    • wsl bash scripts/deploy.sh',
      '    • Ensure Git for Windows is installed',
    ].join('\n'))
  }

  console.log(`▶ Uploading frontend → ${SSH_TARGET}:${REMOTE_WEB_ROOT}/ (tar+ssh via ${bash})`)
  console.log('  Note: stale hashed files may linger — prefer rsync when possible')
  run(bash, ['-c',
    `cd dist && tar cf - --exclude='./.htaccess' . ` +
    `| ssh ${SSH_MUX} "${SSH_TARGET}" "mkdir -p ${REMOTE_WEB_ROOT} && cd ${REMOTE_WEB_ROOT} && tar xf -"`])
  console.log('  ✓ Frontend deployed\n')

  console.log(`▶ Uploading PHP API → ${SSH_TARGET}:${REMOTE_PHP_ROOT}/ (tar+ssh)`)
  run(bash, ['-c',
    `cd php/api && tar cf - --exclude='./config.secret.php' --exclude='./config.secret.example.php' . ` +
    `| ssh ${SSH_MUX} "${SSH_TARGET}" "mkdir -p ${REMOTE_PHP_ROOT} && cd ${REMOTE_PHP_ROOT} && tar xf -"`])
  console.log('  ✓ PHP deployed (config.secret.php untouched)\n')
}

console.log('✓ Deploy complete → https://pwv-insights.gennetten.org')
