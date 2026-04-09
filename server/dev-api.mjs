/**
 * Local dev API server — mirrors the PHP endpoints for local development.
 * Run alongside Vite: npm run dev:api
 *
 * OTP codes are printed to this terminal instead of being emailed.
 * In production, the PHP files on DreamHost handle the same routes.
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
  } else {
    send(res, { error: 'Not found' }, 404)
  }
})

server.listen(PORT, () => {
  console.log(`\x1b[32m  ✓ Dev API server running on http://localhost:${PORT}\x1b[0m`)
  console.log(`    DB: ${process.env.DB_NAME}@${process.env.DB_HOST}\n`)
})
