// Core Cloudflare API client
// Auth: CF_API_TOKEN (Bearer) or CF_API_KEY + CF_API_EMAIL (legacy)
// Loads .env from cwd or ~/.env if env vars not set

import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'

// Load .env file - only sets vars not already in environment
function loadEnv(filepath) {
  if (!existsSync(filepath)) return
  const lines = readFileSync(filepath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    // strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

// try .env in cwd first, then ~/.env
loadEnv(join(process.cwd(), '.env'))
loadEnv(join(homedir(), '.env'))

const BASE = 'https://api.cloudflare.com/client/v4'

function authHeaders() {
  const token = process.env.CF_API_TOKEN
  if (token) return { Authorization: `Bearer ${token}` }

  const key = process.env.CF_API_KEY
  const email = process.env.CF_API_EMAIL
  if (key && email) return { 'X-Auth-Key': key, 'X-Auth-Email': email }

  throw new Error('set CF_API_TOKEN (or CF_API_KEY + CF_API_EMAIL)')
}

// Prefer legacy key auth (broader permissions for workers ops)
function keyAuthHeaders() {
  const key = process.env.CF_API_KEY
  const email = process.env.CF_API_EMAIL
  if (key && email) return { 'X-Auth-Key': key, 'X-Auth-Email': email }

  const token = process.env.CF_API_TOKEN
  if (token) return { Authorization: `Bearer ${token}` }

  throw new Error('set CF_API_KEY + CF_API_EMAIL (or CF_API_TOKEN)')
}

// Core API call. Returns parsed JSON (or text for non-json responses).
// path: relative to /client/v4/ or full URL starting with http
export async function api(method, path, body) {
  method = method.toUpperCase()

  let url
  if (path.startsWith('http')) {
    url = path
  } else {
    url = `${BASE}/${path.replace(/^\//, '')}`
  }

  const headers = { ...authHeaders(), 'Content-Type': 'application/json' }
  const opts = { method, headers }

  if (body !== undefined && body !== null) {
    opts.body = typeof body === 'string' ? body : JSON.stringify(body)
  }

  const res = await fetch(url, opts)
  const ct = res.headers.get('content-type') || ''

  if (ct.includes('application/json')) {
    return res.json()
  }
  return res.text()
}

// API call preferring legacy key auth (for workers write ops)
export async function keyApi(method, path, body) {
  method = method.toUpperCase()
  let url = path.startsWith('http') ? path : `${BASE}/${path.replace(/^\//, '')}`
  const headers = { ...keyAuthHeaders(), 'Content-Type': 'application/json' }
  const opts = { method, headers }
  if (body !== undefined && body !== null) {
    opts.body = typeof body === 'string' ? body : JSON.stringify(body)
  }
  const res = await fetch(url, opts)
  const ct = res.headers.get('content-type') || ''
  return ct.includes('application/json') ? res.json() : res.text()
}

// Autopaginate - fetch all pages, merge .result arrays
export async function apiAll(method, path) {
  let page = 1
  const perPage = 50
  let all = []
  const sep = path.includes('?') ? '&' : '?'

  while (true) {
    const resp = await api(method, `${path}${sep}page=${page}&per_page=${perPage}`)
    const results = resp.result || []
    all = all.concat(results)

    const totalPages = resp.result_info?.total_pages || 1
    if (page >= totalPages) break
    page++
  }

  return all
}

// Resolve zone name to zone ID. Cached in /tmp for 1 hour.
// Accepts zone name (example.com) or zone ID (32 hex chars) - passthrough.
export async function zoneId(name) {
  if (/^[0-9a-f]{32}$/.test(name)) return name

  const cache = join(tmpdir(), `cf_zone_${name}`)
  try {
    const stat = statSync(cache)
    if (Date.now() - stat.mtimeMs < 3600_000) {
      return readFileSync(cache, 'utf8').trim()
    }
  } catch {}

  const resp = await api('GET', `zones?name=${name}&per_page=1`)
  const id = resp.result?.[0]?.id
  if (!id) throw new Error(`zone '${name}' not found`)

  writeFileSync(cache, id)
  return id
}

// --- output ---------------------------------------------------------------

let _jsonMode = false

export function setJsonMode(on) { _jsonMode = on }

// Format a value for a table cell - flatten objects/arrays, truncate long strings
function cellVal(v) {
  if (v === null || v === undefined) return '-'
  if (v === true) return 'yes'
  if (v === false) return 'no'
  if (Array.isArray(v)) {
    if (v.length === 0) return '-'
    // if array of simple values, join them
    if (v.every(i => typeof i !== 'object')) return v.join(', ')
    return JSON.stringify(v)
  }
  if (typeof v === 'object') return JSON.stringify(v)
  const s = String(v)
  return s.length > 60 ? s.slice(0, 57) + '...' : s
}

// Render array of objects as aligned table
function table(rows) {
  if (!rows.length) return '(empty)'

  const keys = Object.keys(rows[0])
  const headers = keys.map(k => k.toUpperCase())

  // compute column widths
  const widths = keys.map((k, i) => {
    const vals = rows.map(r => cellVal(r[k]).length)
    return Math.max(headers[i].length, ...vals)
  })

  const line = (cols) => cols.map((c, i) => String(c).padEnd(widths[i])).join('  ')

  const out = [line(headers)]
  for (const row of rows) {
    out.push(line(keys.map(k => cellVal(row[k]))))
  }
  return out.join('\n')
}

// Render single object as key-value list
function keyval(obj) {
  const keys = Object.keys(obj)
  if (!keys.length) return '(empty)'
  const maxKey = Math.max(...keys.map(k => k.length))
  return keys.map(k => {
    const v = obj[k]
    const val = (Array.isArray(v) || (typeof v === 'object' && v !== null))
      ? JSON.stringify(v)
      : String(v ?? '-')
    return `${k.padEnd(maxKey)}  ${val}`
  }).join('\n')
}

// Single output function for all commands.
// Handles: arrays of objects (table), objects (key-value), strings (as-is).
// Pass --json / -j globally to get raw JSON instead.
export function out(data) {
  // json mode - raw json, always
  if (_jsonMode) {
    const s = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
    process.stdout.write(s + '\n')
    return
  }

  const w = (s, hint) => {
    process.stdout.write(s + '\n')
    if (hint) process.stderr.write('\x1b[2muse -j for JSON output\x1b[0m\n')
  }

  // plain string (e.g. BIND export)
  if (typeof data === 'string') { w(data, false); return }

  // array of objects -> table
  if (Array.isArray(data)) {
    if (data.length === 0) { w('(empty)', false); return }
    if (typeof data[0] !== 'object') { w(data.join('\n'), true); return }
    w(table(data), true)
    return
  }

  // single object -> key-value
  if (typeof data === 'object' && data !== null) { w(keyval(data), true); return }

  // fallback
  w(String(data), false)
}

// Fatal error
export function die(msg) {
  process.stderr.write(`error: ${msg}\n`)
  process.exit(1)
}
