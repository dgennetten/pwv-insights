/**
 * Local dev API server — OTP auth + optional proxy to real PHP.
 * Run alongside Vite: npm run dev:api
 *
 * Set PHP_API_UPSTREAM in .env.local (e.g. https://your-site.com) so GET /api/dashboard/data.php
 * is forwarded to production. Without it, dashboard fetches return 404 JSON from this server.
 */

import http from 'http'
import crypto from 'crypto'
import mysql from 'mysql2/promise'
import { config } from 'dotenv'

config({ path: '.env.local' })

const PORT      = 3001
const OTP_TTL   = 10 // minutes
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'douglas@gennetten.com'

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
})

async function readJson(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', chunk => body += chunk.toString())
    req.on('end', () => {
      try { resolve(JSON.parse(body)) } catch { resolve({}) }
    })
  })
}

function send(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(JSON.stringify(data))
}

/** Read full request body (for proxying POST to PHP). */
function readReqBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/**
 * Forward /api/* (except built-in auth routes) to real PHP — e.g. DreamHost.
 * Set PHP_API_UPSTREAM in .env.local (origin only, no trailing path), e.g. https://insights.example.com
 */
async function proxyPhpUpstream(req, res) {
  const base = (process.env.PHP_API_UPSTREAM || '').trim().replace(/\/$/, '')
  if (!base) {
    res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(JSON.stringify({
      error: 'Not found',
      hint: 'Local dev: set PHP_API_UPSTREAM in .env.local to your deployed site origin (https://…) so /api/dashboard/data.php can be proxied. This server only implements auth OTP routes.',
    }))
    return
  }
  let targetUrl
  try {
    targetUrl = new URL(req.url || '/', base + '/')
  } catch (e) {
    return send(res, { error: 'Invalid PHP_API_UPSTREAM', detail: String(e) }, 500)
  }
  try {
    const init = {
      method: req.method,
      headers: {
        accept: req.headers.accept || '*/*',
      },
    }
    if (req.headers['content-type']) {
      init.headers['content-type'] = req.headers['content-type']
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = await readReqBuffer(req)
    }
    const r = await fetch(targetUrl, init)
    const ct = r.headers.get('content-type') || 'application/octet-stream'
    const out = Buffer.from(await r.arrayBuffer())
    res.writeHead(r.status, { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*' })
    res.end(out)
  } catch (e) {
    console.error('[proxy]', String(targetUrl), e)
    send(res, { error: 'Upstream request failed', detail: String(e.message) }, 502)
  }
}

const routes = {
  async 'POST /api/auth/request-otp.php'(req, res) {
    const { email = '' } = await readJson(req)
    const normalised = email.trim().toLowerCase()

    // Always return 200 regardless
    if (!normalised.includes('@')) return send(res, { ok: true })

    const [rows] = await pool.query(
      'SELECT PersonID FROM t_member WHERE LOWER(EmailAddress) = ? LIMIT 1',
      [normalised]
    )
    if (!rows.length) return send(res, { ok: true })

    // Invalidate old codes
    await pool.query('UPDATE otp_codes SET used = 1 WHERE email = ? AND used = 0', [normalised])

    // Generate OTP
    const code      = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
    const expiresAt = new Date(Date.now() + OTP_TTL * 60_000)
      .toISOString().slice(0, 19).replace('T', ' ')

    await pool.query(
      'INSERT INTO otp_codes (email, code, expires_at) VALUES (?, ?, ?)',
      [normalised, code, expiresAt]
    )

    // DEV: print to terminal instead of emailing
    console.log(`\n  ✉  OTP for ${normalised}: \x1b[33m${code}\x1b[0m  (expires in ${OTP_TTL} min)\n`)

    send(res, { ok: true })
  },

  async 'POST /api/auth/verify-otp.php'(req, res) {
    const { email = '', code = '' } = await readJson(req)
    const normalised = email.trim().toLowerCase()

    if (!normalised.includes('@') || !/^\d{6}$/.test(code.trim())) {
      return send(res, { success: false, error: 'Invalid input' })
    }

    const [otpRows] = await pool.query(
      'SELECT id FROM otp_codes WHERE email = ? AND code = ? AND used = 0 AND expires_at > NOW() LIMIT 1',
      [normalised, code.trim()]
    )
    if (!otpRows.length) return send(res, { success: false, error: 'Invalid or expired code' })

    await pool.query('UPDATE otp_codes SET used = 1 WHERE id = ?', [otpRows[0].id])

    const [memberRows] = await pool.query(
      'SELECT PersonID, FirstName, LastName FROM t_member WHERE LOWER(EmailAddress) = ? LIMIT 1',
      [normalised]
    )
    if (!memberRows.length) return send(res, { success: false, error: 'Member not found' })

    const member = memberRows[0]
    const token  = crypto.randomBytes(32).toString('hex')
    const expiry = new Date(Date.now() + 30 * 24 * 60 * 60_000)
      .toISOString().slice(0, 19).replace('T', ' ')

    await pool.query(
      'INSERT INTO auth_sessions (person_id, token, expires_at) VALUES (?, ?, ?)',
      [member.PersonID, token, expiry]
    )

    const role = normalised === ADMIN_EMAIL.toLowerCase() ? 'admin' : 'member'

    send(res, {
      success: true,
      token,
      email:   normalised,
      name:    `${member.FirstName} ${member.LastName}`.trim(),
      role,
    })
  },
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' })
    return res.end()
  }

  const key = `${req.method} ${req.url?.split('?')[0]}`
  const handler = routes[key]

  if (handler) {
    try {
      await handler(req, res)
    } catch (err) {
      console.error(`[api] ${key}:`, err)
      send(res, { error: 'Server error' }, 500)
    }
  } else if (req.url?.startsWith('/api/')) {
    await proxyPhpUpstream(req, res)
  } else {
    send(res, { error: 'Not found' }, 404)
  }
})

server.listen(PORT, () => {
  console.log(`\x1b[32m  ✓ Dev API server running on http://localhost:${PORT}\x1b[0m`)
  console.log(`    DB: ${process.env.DB_NAME}@${process.env.DB_HOST}`)
  if (!process.env.PHP_API_UPSTREAM?.trim()) {
    console.log(`\x1b[33m    ⚠ PHP_API_UPSTREAM not set — /api/dashboard/* will 404. Add to .env.local:\x1b[0m`)
    console.log(`      PHP_API_UPSTREAM=https://your-production-site.com\n`)
  } else {
    console.log(`    PHP proxy → ${process.env.PHP_API_UPSTREAM.trim()}\n`)
  }
})
