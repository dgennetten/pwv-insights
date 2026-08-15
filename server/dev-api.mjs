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
const PWV_MEMBER_PHOTO_BASE = 'https://clrdvol.org/fs_pics/'

function memberPhotoUrl(photo) {
  const name = String(photo ?? '').trim()
  if (!name) return null
  if (/^https?:\/\//i.test(name)) return name
  return PWV_MEMBER_PHOTO_BASE + encodeURIComponent(name.replace(/^.*[/\\]/, ''))
}

function memberStatusLabel(orgStatusName, memberSince, agreementDate, lockedInactive) {
  if (Number(lockedInactive) === 1) return 'Inactive'
  const status = String(orgStatusName ?? '').trim()
  if (status.toLowerCase() === 'active') {
    const since = String(memberSince ?? '').trim()
    if (since && since !== '0000') return `Active since ${since}`
    const ad = String(agreementDate ?? '').trim()
    if (ad && ad !== '0000-00-00') {
      const dt = new Date(ad.includes('T') ? ad : `${ad}T12:00:00`)
      if (!Number.isNaN(dt.getTime())) {
        return `Active since ${dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
      }
    }
    return 'Active'
  }
  return status || '—'
}

async function resolveMemberTypes(pool, memTypeIds) {
  const raw = String(memTypeIds ?? '').trim()
  if (!raw) return null
  const ids = [...new Set(raw.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0))]
  if (!ids.length) return null
  const [rows] = await pool.query(
    `SELECT MemTypeName FROM lu_member_type WHERE MemTypeID IN (?) ORDER BY DisplayOrder, MemTypeID`,
    [ids]
  )
  const names = rows.map(r => String(r.MemTypeName ?? '').trim()).filter(Boolean)
  return names.length ? names.join(', ') : null
}

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
})

/** Matches sql/03-auth-login-log.sql — self-heal when migration was not applied. */
const AUTH_LOGIN_LOG_DDL = `CREATE TABLE IF NOT EXISTS auth_login_log (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  person_id     INT UNSIGNED NOT NULL,
  logged_in_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_logged_in (logged_in_at),
  INDEX idx_person_time (person_id, logged_in_at),
  CONSTRAINT fk_auth_login_person
    FOREIGN KEY (person_id) REFERENCES t_member(PersonID) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`

async function ensureAuthLoginLogTable() {
  try {
    await pool.query(AUTH_LOGIN_LOG_DDL)
  } catch (e) {
    console.warn('[auth] auth_login_log ensure table:', e.message)
  }
}

const TRIAL_DAYS = 7
const TRIAL_LINKS_DDL = `CREATE TABLE IF NOT EXISTS trial_links (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token         CHAR(64)        NOT NULL,
  label         VARCHAR(120)    NULL,
  created_by    INT UNSIGNED    NOT NULL,
  created_at    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activated_at  DATETIME        NULL,
  expires_at    DATETIME        NULL,
  revoked       TINYINT(1)      NOT NULL DEFAULT 0,
  use_count     INT UNSIGNED    NOT NULL DEFAULT 0,
  last_used_at  DATETIME        NULL,
  UNIQUE KEY uq_trial_token (token),
  INDEX idx_trial_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`

async function ensureTrialLinksTable() {
  try {
    await pool.query(TRIAL_LINKS_DDL)
  } catch (e) {
    console.warn('[trial] trial_links ensure table:', e.message)
  }
}

/** Resolve an admin session token to its PersonID, or send a JSON error and return null. */
async function resolveAdminPersonId(res, token) {
  if (!token || token.length !== 64 || !/^[a-f0-9]+$/i.test(token)) {
    send(res, { success: false, error: 'Invalid token' }, 401)
    return null
  }
  const [sess] = await pool.query(
    `SELECT s.person_id, s.expires_at, m.EmailAddress
     FROM auth_sessions s JOIN t_member m ON m.PersonID = s.person_id
     WHERE s.token = ? LIMIT 1`,
    [token]
  )
  if (!sess.length) { send(res, { success: false, error: 'Unknown session' }, 401); return null }
  const exp = new Date(sess[0].expires_at).getTime()
  if (!Number.isFinite(exp) || exp < Date.now()) {
    send(res, { success: false, error: 'Session expired' }, 401); return null
  }
  if (String(sess[0].EmailAddress ?? '').trim().toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    send(res, { success: false, error: 'Forbidden' }, 403); return null
  }
  return Number(sess[0].person_id)
}

function trialLinkRow(r) {
  const expiresTs = r.expires_at !== null ? new Date(r.expires_at).getTime() : null
  const activated = r.activated_at !== null
  const revoked   = Number(r.revoked) === 1
  const expired   = expiresTs !== null && expiresTs < Date.now()
  const status = revoked ? 'revoked' : !activated ? 'pending' : expired ? 'expired' : 'active'
  return {
    id: Number(r.id),
    token: String(r.token),
    label: r.label !== null ? String(r.label) : '',
    createdAtMs: r.created_at !== null ? new Date(r.created_at).getTime() : 0,
    expiresAtMs: expiresTs ?? 0,
    useCount: Number(r.use_count) || 0,
    status,
  }
}

async function authLoginLogInsert(personId) {
  const pid = Number(personId)
  if (!Number.isFinite(pid) || pid < 1) return
  await ensureAuthLoginLogTable()
  try {
    await pool.query('INSERT INTO auth_login_log (person_id) VALUES (?)', [pid])
  } catch (e) {
    console.warn('[auth] auth_login_log insert skipped:', e.message)
  }
}

/** Matches php memberLastLoginTouch — T_MEMBER_LAST_LOGIN_COLUMN or default last_login_at. */
let memberLastLoginColResolved = null
async function memberLastLoginTouch(personId) {
  const pid = Number(personId)
  if (!Number.isFinite(pid) || pid < 1) return
  if (memberLastLoginColResolved === false) return
  if (memberLastLoginColResolved === null) {
    const name = (process.env.T_MEMBER_LAST_LOGIN_COLUMN || 'last_login_at').trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      memberLastLoginColResolved = false
      return
    }
    const [rows] = await pool.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_member' AND COLUMN_NAME = ?
       LIMIT 1`,
      [name]
    )
    if (!rows.length) {
      memberLastLoginColResolved = false
      return
    }
    memberLastLoginColResolved = name
  }
  try {
    await pool.query(
      `UPDATE t_member SET \`${memberLastLoginColResolved}\` = CURRENT_TIMESTAMP WHERE PersonID = ? LIMIT 1`,
      [pid]
    )
  } catch (e) {
    console.warn('[auth] t_member last login touch:', e.message)
  }
}

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
    const expiresAtMs = Date.now() + 30 * 24 * 60 * 60 * 1000
    const expiry = new Date(expiresAtMs).toISOString().slice(0, 19).replace('T', ' ')

    await pool.query(
      'INSERT INTO auth_sessions (person_id, token, expires_at) VALUES (?, ?, ?)',
      [member.PersonID, token, expiry]
    )

    await authLoginLogInsert(member.PersonID)

    const role = normalised === ADMIN_EMAIL.toLowerCase() ? 'admin' : 'member'

    send(res, {
      success: true,
      token,
      email:   normalised,
      name:    `${member.FirstName} ${member.LastName}`.trim(),
      role,
      personId: member.PersonID,
      expiresAt: expiresAtMs,
    })
  },

  async 'POST /api/auth/dev-auto-login.php'(req, res) {
    const normalised = ADMIN_EMAIL.trim().toLowerCase()
    const [memberRows] = await pool.query(
      'SELECT PersonID, FirstName, LastName FROM t_member WHERE LOWER(EmailAddress) = ? LIMIT 1',
      [normalised]
    )
    if (!memberRows.length) return send(res, { success: false, error: 'Member not found' }, 404)
    const member = memberRows[0]
    const token  = crypto.randomBytes(32).toString('hex')
    const expiresAtMs = Date.now() + 365 * 24 * 60 * 60 * 1000
    const expiry = new Date(expiresAtMs).toISOString().slice(0, 19).replace('T', ' ')
    await pool.query('INSERT INTO auth_sessions (person_id, token, expires_at) VALUES (?, ?, ?)',
      [member.PersonID, token, expiry])
    await authLoginLogInsert(member.PersonID)
    send(res, {
      success: true, token,
      email: normalised,
      name: `${member.FirstName} ${member.LastName}`.trim(),
      role: 'admin',
      personId: member.PersonID,
      expiresAt: expiresAtMs,
    })
  },

  async 'POST /api/auth/session.php'(req, res) {
    const body = await readJson(req)
    const token = String(body.token ?? '').trim()
    if (!token || token.length !== 64 || !/^[a-f0-9]+$/i.test(token)) {
      return send(res, { success: false, error: 'Invalid token' }, 401)
    }

    const [rows] = await pool.query(
      `SELECT s.person_id, s.expires_at, m.FirstName, m.LastName, m.EmailAddress
       FROM auth_sessions s
       JOIN t_member m ON m.PersonID = s.person_id
       WHERE s.token = ? LIMIT 1`,
      [token]
    )
    if (!rows.length) return send(res, { success: false, error: 'Unknown session' }, 401)

    const row = rows[0]
    const exp = new Date(row.expires_at).getTime()
    if (!Number.isFinite(exp) || exp < Date.now()) {
      await pool.query('DELETE FROM auth_sessions WHERE token = ?', [token])
      return send(res, { success: false, error: 'Session expired' }, 401)
    }

    const email = String(row.EmailAddress ?? '').trim().toLowerCase()
    const role = email === ADMIN_EMAIL.toLowerCase() ? 'admin' : 'member'

    await authLoginLogInsert(row.person_id)
    await memberLastLoginTouch(row.person_id)

    send(res, {
      success: true,
      token,
      email,
      name: `${row.FirstName ?? ''} ${row.LastName ?? ''}`.trim(),
      role,
      personId: row.person_id,
      expiresAt: exp,
    })
  },

  async 'POST /api/feedback/send.php'(req, res) {
    const { message = '', name = '', email = '', website = '' } = await readJson(req)
    if (String(website).trim()) return send(res, { success: true })
    const text = String(message).trim()
    if (!text) return send(res, { success: false, error: 'Message is required' }, 400)
    console.log('\n  📬 PWV Insights feedback')
    if (name) console.log('     Name:', String(name).trim())
    if (email) console.log('     Email:', String(email).trim())
    console.log('     Message:', text, '\n')
    send(res, { success: true })
  },

  async 'POST /api/admin/member-lookup.php'(req, res) {
    const body = await readJson(req)
    const token    = String(body.token ?? '').trim()
    const memberId = Number(body.memberId ?? 0)

    if (!token || token.length !== 64 || !/^[a-f0-9]+$/i.test(token)) {
      return send(res, { success: false, error: 'Invalid token' }, 401)
    }
    if (!Number.isFinite(memberId) || memberId < 1) {
      return send(res, { success: false, error: 'Invalid memberId' }, 400)
    }

    const [sess] = await pool.query(
      `SELECT s.expires_at, m.EmailAddress
       FROM auth_sessions s
       JOIN t_member m ON m.PersonID = s.person_id
       WHERE s.token = ? LIMIT 1`,
      [token]
    )
    if (!sess.length) return send(res, { success: false, error: 'Unknown session' }, 401)
    const exp = new Date(sess[0].expires_at).getTime()
    if (!Number.isFinite(exp) || exp < Date.now()) return send(res, { success: false, error: 'Session expired' }, 401)
    if (String(sess[0].EmailAddress ?? '').trim().toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      return send(res, { success: false, error: 'Forbidden' }, 403)
    }

    // Fetch member core info
    const [memberRows] = await pool.query(
      `SELECT m.PersonID, m.FirstName, m.LastName, m.BirthDate, m.EmailAddress, m.Photo,
              mg.OrgStatusID, os.OrgStatusName, mg.MemberSince, mg.AgreementDate, mg.MemTypeIDs,
              lo.IsInactive AS LockedInactive
       FROM t_member m
       LEFT JOIN t_mem_group mg ON mg.PersonID = m.PersonID AND mg.GroupID = 10
       LEFT JOIN lu_org_status os ON os.OrgStatusID = mg.OrgStatusID
       LEFT JOIN t_locked_out lo ON lo.PersonID = m.PersonID
       WHERE m.PersonID = ?
       LIMIT 1`,
      [memberId]
    )
    const m = memberRows[0]
    if (!m) return send(res, { success: false, error: 'Member not found' }, 404)

    // Address from t_mem_address
    const [addrRows] = await pool.query(
      'SELECT StreetAddress, City, State, ZipCode FROM t_mem_address WHERE PersonID = ? ORDER BY MemAddressID ASC LIMIT 1',
      [memberId]
    ).catch(() => [[]])
    const addr = addrRows[0] ?? {}

    // Phone from t_mem_phone (prefer PhonePrimary = 1)
    const [phoneRows] = await pool.query(
      'SELECT PhoneNumber FROM t_mem_phone WHERE PersonID = ? ORDER BY COALESCE(PhonePrimary, 0) DESC, MemPhoneID ASC LIMIT 1',
      [memberId]
    ).catch(() => [[]])
    const phoneRow = phoneRows[0] ?? {}

    // Age from BirthDate
    let age = null, dob = null
    if (m.BirthDate && String(m.BirthDate) !== '0000-00-00') {
      const bd = new Date(m.BirthDate)
      if (!isNaN(bd.getTime())) {
        const now = new Date()
        age = now.getFullYear() - bd.getFullYear()
        if (now.getMonth() < bd.getMonth() || (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate())) age--
        dob = bd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      }
    }

    // Season patrol stats (Oct 1 – Sep 30)
    const now = new Date()
    const mo = now.getMonth() + 1
    const yr = now.getFullYear()
    const seasonStart = mo >= 10 ? `${yr}-10-01` : `${yr - 1}-10-01`
    const scope = `r.GroupID = 10 AND (r.IsDraft IS NULL OR r.IsDraft = 0)
      AND (r.IsUnofficial IS NULL OR r.IsUnofficial = 0)
      AND r.ActivityDate >= '${seasonStart}'`

    const [[{ cnt: memberDays }]] = await pool.query(
      `SELECT COUNT(DISTINCT r.ReportID) AS cnt
       FROM t_report_member rm
       JOIN t_report r ON r.ReportID = rm.ReportID
       WHERE rm.PersonID = ? AND ${scope}`,
      [memberId]
    )
    const [[{ avg_cnt: avgDays }]] = await pool.query(
      `SELECT ROUND(AVG(cnt), 1) AS avg_cnt FROM (
         SELECT COUNT(DISTINCT r.ReportID) AS cnt
         FROM t_report_member rm
         JOIN t_report r ON r.ReportID = rm.ReportID
         WHERE ${scope}
         GROUP BY rm.PersonID
       ) sub`
    )

    const ratio = avgDays > 0 ? Math.round((Number(memberDays) / Number(avgDays)) * 100) / 100 : null
    const memberType = await resolveMemberTypes(pool, m.MemTypeIDs)

    return send(res, {
      success: true,
      member: {
        memberId:    Number(m.PersonID),
        fullName:    `${m.FirstName ?? ''} ${m.LastName ?? ''}`.trim(),
        email:       String(m.EmailAddress ?? '').trim(),
        dateOfBirth: dob,
        age,
        address:     addr.StreetAddress ?? null,
        city:        addr.City         ?? null,
        state:       addr.State        ?? null,
        zip:         addr.ZipCode      ?? null,
        phone:       phoneRow.PhoneNumber ?? null,
        memberType,
        photoUrl:    memberPhotoUrl(m.Photo),
        status:      memberStatusLabel(
          m.OrgStatusName,
          m.MemberSince,
          m.AgreementDate,
          m.LockedInactive
        ),
        merit: {
          memberDays:  Number(memberDays),
          avgDays:     Number(avgDays),
          ratio,
          seasonStart,
        },
      },
    })
  },

  async 'POST /api/admin/recent-logins.php'(req, res) {
    const body = await readJson(req)
    const token = String(body.token ?? '').trim()
    if (!token || token.length !== 64 || !/^[a-f0-9]+$/i.test(token)) {
      return send(res, { success: false, error: 'Invalid token' }, 401)
    }

    const [sess] = await pool.query(
      `SELECT s.person_id, s.expires_at, m.EmailAddress
       FROM auth_sessions s
       JOIN t_member m ON m.PersonID = s.person_id
       WHERE s.token = ? LIMIT 1`,
      [token]
    )
    if (!sess.length) return send(res, { success: false, error: 'Unknown session' }, 401)

    const exp = new Date(sess[0].expires_at).getTime()
    if (!Number.isFinite(exp) || exp < Date.now()) {
      return send(res, { success: false, error: 'Session expired' }, 401)
    }

    const email = String(sess[0].EmailAddress ?? '').trim().toLowerCase()
    if (email !== ADMIN_EMAIL.toLowerCase()) {
      return send(res, { success: false, error: 'Forbidden' }, 403)
    }

    await ensureAuthLoginLogTable()
    try {
      const [rows] = await pool.query(
        `SELECT l.person_id AS memberId, m.LastName AS lastName, m.FirstName AS firstName,
                UNIX_TIMESTAMP(l.logged_in_at) * 1000 AS loggedInAtMs,
                COALESCE(l.login_type, 'OTC') AS loginType
         FROM auth_login_log l
         INNER JOIN t_member m ON m.PersonID = l.person_id
         ORDER BY l.logged_in_at DESC, l.id DESC
         LIMIT 500`
      )
      const logins = rows.map((r) => ({
        memberId: Number(r.memberId),
        lastName: String(r.lastName ?? ''),
        firstName: String(r.firstName ?? ''),
        loggedInAtMs: Number(r.loggedInAtMs) || 0,
        loginType: ['ACCESS', 'AUTO'].includes(r.loginType) ? r.loginType : 'OTC',
      }))

      // Trial guests aren't members — surface each activated trial link as a TRIAL row.
      try {
        await ensureTrialLinksTable()
        const [trialRows] = await pool.query(
          `SELECT label, use_count,
                  UNIX_TIMESTAMP(COALESCE(last_used_at, activated_at)) * 1000 AS loggedInAtMs
           FROM trial_links WHERE activated_at IS NOT NULL
           ORDER BY COALESCE(last_used_at, activated_at) DESC LIMIT 500`
        )
        for (const r of trialRows) {
          const label = String(r.label ?? '').trim()
          logins.push({
            memberId: 0,
            lastName: '',
            firstName: label !== '' ? `Trial · ${label}` : 'Trial Guest',
            loggedInAtMs: Number(r.loggedInAtMs) || 0,
            loginType: 'TRIAL',
          })
        }
      } catch (e) {
        console.warn('[admin/recent-logins] trial merge:', e.message)
      }

      logins.sort((a, b) => b.loggedInAtMs - a.loggedInAtMs)
      return send(res, { success: true, logins: logins.slice(0, 500) })
    } catch (e) {
      console.error('[admin/recent-logins]', e)
      return send(res, {
        success: false,
        error: 'Could not load login history',
        hint: 'Run sql/03-auth-login-log.sql on the database.',
      }, 500)
    }
  },

  async 'POST /api/auth/trial-login.php'(req, res) {
    const body = await readJson(req)
    const token = String(body.token ?? '').trim().toLowerCase()
    if (!token || token.length !== 64 || !/^[a-f0-9]+$/i.test(token)) {
      return send(res, { success: false, error: 'Invalid trial link' }, 401)
    }
    await ensureTrialLinksTable()

    const [rows] = await pool.query(
      'SELECT id, activated_at, expires_at, revoked FROM trial_links WHERE token = ? LIMIT 1',
      [token]
    )
    if (!rows.length) return send(res, { success: false, error: 'Trial link not found' }, 401)
    const link = rows[0]
    if (Number(link.revoked) === 1) {
      return send(res, { success: false, error: 'This trial link has been revoked' }, 403)
    }

    let expiresMs
    if (link.activated_at === null) {
      expiresMs = Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000
      const expiry = new Date(expiresMs).toISOString().slice(0, 19).replace('T', ' ')
      await pool.query(
        `UPDATE trial_links
         SET activated_at = NOW(), expires_at = ?, use_count = use_count + 1, last_used_at = NOW()
         WHERE id = ?`,
        [expiry, link.id]
      )
    } else {
      expiresMs = new Date(link.expires_at).getTime()
      if (!Number.isFinite(expiresMs) || expiresMs < Date.now()) {
        return send(res, { success: false, error: 'This trial has expired', expired: true }, 403)
      }
      await pool.query('UPDATE trial_links SET use_count = use_count + 1, last_used_at = NOW() WHERE id = ?', [link.id])
    }

    send(res, {
      success: true,
      token,
      email: '',
      name: 'Trial Guest',
      role: 'trial',
      personId: 0,
      expiresAt: expiresMs,
      trialDays: TRIAL_DAYS,
    })
  },

  async 'POST /api/admin/trial-links.php'(req, res) {
    const body = await readJson(req)
    const token = String(body.token ?? '').trim()
    const action = String(body.action ?? 'list').trim()

    const adminId = await resolveAdminPersonId(res, token)
    if (adminId === null) return
    await ensureTrialLinksTable()

    if (action === 'create') {
      let label = String(body.label ?? '').trim().slice(0, 120)
      const newToken = crypto.randomBytes(32).toString('hex')
      await pool.query('INSERT INTO trial_links (token, label, created_by) VALUES (?, ?, ?)',
        [newToken, label !== '' ? label : null, adminId])
      const [rows] = await pool.query('SELECT * FROM trial_links WHERE token = ? LIMIT 1', [newToken])
      return send(res, { success: true, link: trialLinkRow(rows[0]) })
    }

    if (action === 'revoke') {
      const id = Number(body.id ?? 0)
      if (!Number.isFinite(id) || id < 1) return send(res, { success: false, error: 'Invalid id' }, 400)
      await pool.query('UPDATE trial_links SET revoked = 1 WHERE id = ?', [id])
      return send(res, { success: true })
    }

    const [rows] = await pool.query('SELECT * FROM trial_links ORDER BY created_at DESC LIMIT 100')
    return send(res, { success: true, links: rows.map(trialLinkRow) })
  },

  async 'GET /api/trails/ai-summary.php'(req, res) {
    // Dev mock — returns a placeholder so the card renders locally.
    // In production the PHP endpoint calls Claude and caches the result.
    send(res, {
      summary: '[Dev] Trail conditions are generally good based on recent patrols. Moderate visitor traffic observed on weekends, with most hikers complying with Leave No Trace guidelines. No significant hazards reported; one downed tree near mile 2 was cleared on the most recent patrol.',
      generatedAt: new Date().toISOString(),
      reportIds: [1001, 1002, 1003],
      cached: false,
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
