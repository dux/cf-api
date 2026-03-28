import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { homedir } from 'node:os'

const BASE = 'https://api.cloudflare.com/client/v4'

// --- output helpers ---

const G = '\x1b[32m'  // green
const R = '\x1b[31m'  // red
const Y = '\x1b[33m'  // yellow
const D = '\x1b[2m'   // dim
const B = '\x1b[1m'   // bold
const C = '\x1b[36m'  // cyan
const X = '\x1b[0m'   // reset

function ok(label, msg)   { process.stderr.write(`  ${G}ok${X}  ${label.padEnd(22)} ${msg}\n`) }
function fail(label, msg) { process.stderr.write(`  ${R}--${X}  ${label.padEnd(22)} ${R}${msg}${X}\n`) }
function warn(label, msg) { process.stderr.write(`  ${Y}??${X}  ${label.padEnd(22)} ${Y}${msg}${X}\n`) }
function info(label, msg) { process.stderr.write(`  ${D}..${X}  ${label.padEnd(22)} ${D}${msg}${X}\n`) }
function head(title)      { process.stderr.write(`\n  ${B}${title}${X}\n  ${'~'.repeat(title.length)}\n`) }
function line(msg)        { process.stderr.write(`  ${msg}\n`) }
function gap()            { process.stderr.write('\n') }

// --- checks ---

async function apiFetch(path, headers) {
  const res = await fetch(`${BASE}/${path}`, { headers })
  return res.json()
}

async function checkAuth() {
  head('Authentication')

  const token = process.env.CF_API_TOKEN
  const key = process.env.CF_API_KEY
  const email = process.env.CF_API_EMAIL
  let hasWorkingAuth = false
  let tokenWorks = false
  let keyWorks = false

  // check where env vars are loaded from (same order as api.js)
  const cwd = process.cwd()
  const envPaths = [
    join(cwd, 'config', 'cf-api.env'),
    join(cwd, 'cf-api.env'),
    join(cwd, '.env'),
    join(homedir(), '.env'),
  ]
  const loadedEnvs = envPaths.filter(p => existsSync(p))
  if (loadedEnvs.length) {
    for (const p of loadedEnvs) ok('.env', `loaded ${p}`)
  } else {
    warn('.env', 'no env file found')
  }

  // check API token
  if (token) {
    try {
      const resp = await apiFetch('user/tokens/verify', { Authorization: `Bearer ${token}` })
      if (resp.success) {
        ok('CF_API_TOKEN', `valid (${token.slice(0, 8)}...)`)
        hasWorkingAuth = true
        tokenWorks = true
      } else {
        fail('CF_API_TOKEN', 'set but invalid or expired')
      }
    } catch {
      fail('CF_API_TOKEN', 'set but could not verify (network error)')
    }
  } else {
    warn('CF_API_TOKEN', 'not set')
    info('', 'create at: https://dash.cloudflare.com/profile/api-tokens')
  }

  // check legacy key
  if (key && email) {
    try {
      const resp = await apiFetch('user', { 'X-Auth-Key': key, 'X-Auth-Email': email })
      if (resp.success) {
        ok('CF_API_KEY + EMAIL', `valid (${email})`)
        hasWorkingAuth = true
        keyWorks = true
      } else {
        fail('CF_API_KEY + EMAIL', 'set but invalid')
      }
    } catch {
      fail('CF_API_KEY + EMAIL', 'set but could not verify')
    }
  } else if (key || email) {
    fail('CF_API_KEY + EMAIL', 'incomplete - need both CF_API_KEY and CF_API_EMAIL')
    info('', 'find at: https://dash.cloudflare.com/profile/api-tokens (Global API Key)')
  } else if (!token) {
    warn('CF_API_KEY + EMAIL', 'not set (fallback for deploy)')
    info('', 'find at: https://dash.cloudflare.com/profile/api-tokens (Global API Key)')
  }

  if (!hasWorkingAuth) {
    fail('result', 'no working auth found')
    info('', 'set in shell profile or .env file:')
    info('', '  export CF_API_TOKEN="your-token-here"')
  }

  return { hasWorkingAuth, token, key, email, tokenWorks, keyWorks }
}

async function checkPermissions(auth) {
  head('Permissions')

  if (!auth.hasWorkingAuth) {
    fail('skipped', 'no auth to test')
    return {}
  }

  const headers = auth.key && auth.email
    ? { 'X-Auth-Key': auth.key, 'X-Auth-Email': auth.email }
    : { Authorization: `Bearer ${auth.token}` }

  let accountId = process.env.CF_ACCOUNT_ID

  // zones read
  let canReadZones = false
  let zoneCount = 0
  try {
    const resp = await apiFetch('zones?per_page=1', headers)
    if (resp.success && resp.result?.length > 0) {
      zoneCount = resp.result_info?.total_count || '?'
      ok('zones read', `yes (${zoneCount} zones)`)
      canReadZones = true
      if (!accountId) accountId = resp.result[0].account?.id
    } else if (resp.success) {
      warn('zones read', 'yes but no zones found')
    } else {
      fail('zones read', resp.errors?.[0]?.message || 'denied')
    }
  } catch {
    fail('zones read', 'network error')
  }

  if (canReadZones) {
    info('zones write', 'assumed (same token)')
  }

  // account ID
  if (accountId) {
    ok('account ID', accountId)
    if (process.env.CF_ACCOUNT_ID) {
      info('', 'from CF_ACCOUNT_ID env var')
    } else {
      info('', 'auto-detected from zones (accounts API may lack permission)')
      info('', 'set CF_ACCOUNT_ID to skip the lookup')
    }
  } else {
    warn('account ID', 'could not detect')
    info('', 'set CF_ACCOUNT_ID env var')
    info('', 'find at: dash.cloudflare.com -> any zone -> Overview -> right sidebar')
  }

  // workers
  if (accountId) {
    try {
      const resp = await apiFetch(`accounts/${accountId}/workers/scripts`, headers)
      if (resp.success) {
        ok('workers read', `yes (${resp.result?.length || 0} scripts)`)
      } else {
        fail('workers read', resp.errors?.[0]?.message || 'denied')
        info('', 'token needs "Workers Scripts: Read" permission')
      }
    } catch {
      fail('workers read', 'network error')
    }

    if (auth.keyWorks) {
      ok('workers write', 'yes (Global API Key has all permissions)')
    } else if (auth.tokenWorks) {
      warn('workers write', 'unknown - cannot test without deploying')
      info('', 'if deploy fails, your token may lack "Workers Scripts: Edit"')
      info('', 'set CF_API_KEY + CF_API_EMAIL for deploy (Global Key has full access)')
    }
  }

  // R2
  if (accountId) {
    try {
      const resp = await apiFetch(`accounts/${accountId}/r2/buckets`, headers)
      if (resp.success) {
        const buckets = resp.result?.buckets || resp.result || []
        ok('r2 read', `yes (${buckets.length} buckets)`)
      } else {
        info('r2 read', 'denied or not enabled')
      }
    } catch {
      info('r2 read', 'could not check')
    }
  }

  // KV
  if (accountId) {
    try {
      const resp = await apiFetch(`accounts/${accountId}/storage/kv/namespaces`, headers)
      if (resp.success) {
        ok('kv read', `yes (${resp.result?.length || 0} namespaces)`)
      } else {
        info('kv read', 'denied or not used')
      }
    } catch {
      info('kv read', 'could not check')
    }
  }

  return { accountId, zoneCount }
}

function checkTools() {
  head('Build tools (for cf-api deploy)')

  let hasBundler = false

  // esbuild
  try {
    const v = execSync('esbuild --version', { stdio: 'pipe' }).toString().trim()
    ok('esbuild', `installed (${v})`)
    hasBundler = true
  } catch {
    info('esbuild', 'not found - install: npm i -g esbuild')
  }

  // bun
  try {
    const v = execSync('bun --version', { stdio: 'pipe' }).toString().trim()
    ok('bun', `installed (${v})`)
    hasBundler = true
  } catch {
    info('bun', 'not found - install: https://bun.sh')
  }

  if (!hasBundler) {
    fail('bundler', 'none found - cf-api deploy needs esbuild or bun for TS')
    info('', 'plain .js files deploy without a bundler')
  }

  // node
  const v = process.version
  const major = parseInt(v.slice(1))
  if (major >= 18) {
    ok('node', `${v}`)
  } else {
    warn('node', `${v} - need 18+ for native fetch`)
  }
}

function checkConfig() {
  head('Project config (current directory)')

  const cwd = process.cwd()
  let found = false
  for (const dir of [cwd, resolve(cwd, 'config')]) {
    for (const name of ['wrangler.toml', 'wrangler.json']) {
      const p = resolve(dir, name)
      if (existsSync(p)) {
        ok(name, p === resolve(cwd, name) ? 'found' : `found in config/`)
        found = true
        break
      }
    }
    if (found) break
  }
  if (!found) {
    info('config', 'no wrangler.toml or wrangler.json here or in config/')
    info('', 'only needed when running cf-api deploy')
  }

  const envCandidates = [
    [join(cwd, 'config', 'cf-api.env'), 'config/cf-api.env'],
    [join(cwd, 'cf-api.env'), 'cf-api.env'],
    [join(cwd, '.env'), '.env'],
  ]
  for (const [p, label] of envCandidates) {
    if (existsSync(p)) ok(label, 'found (loaded at startup)')
  }
}

function printNotes() {
  head('About cf-api')
  gap()
  line(`Single CLI for full Cloudflare API access.`)
  line(`Raw API calls with human-friendly verbs + workflow shortcuts.`)
  line(`Table output by default, ${C}-j${X} for raw JSON. Run ${C}cf-api --help${X} for commands.`)
  gap()

  head('Auth setup')
  gap()
  line(`${B}Option 1: API Token${X} (recommended for read operations)`)
  line(`  export CF_API_TOKEN="your-token"`)
  line(`  Create at: ${D}https://dash.cloudflare.com/profile/api-tokens${X}`)
  gap()
  line(`${B}Option 2: Global API Key${X} (full permissions, needed for deploy)`)
  line(`  export CF_API_KEY="your-global-key"`)
  line(`  export CF_API_EMAIL="your-email@example.com"`)
  line(`  Find key at: ${D}dash.cloudflare.com/profile/api-tokens -> Global API Key${X}`)
  gap()
  line(`${B}Optional:${X}`)
  line(`  export CF_ACCOUNT_ID="your-account-id"   ${D}# skips auto-detection${X}`)
  gap()
  line(`${B}Env file search order${X} (first match wins per var):`)
  line(`  1. ${C}./config/cf-api.env${X}   ${D}project config dir${X}`)
  line(`  2. ${C}./cf-api.env${X}           ${D}project root${X}`)
  line(`  3. ${C}./.env${X}                 ${D}generic dotenv${X}`)
  line(`  4. ${C}~/.env${X}                 ${D}global fallback${X}`)
  gap()
  line(`Deploy prefers CF_API_KEY (Global Key) over CF_API_TOKEN`)
  line(`because tokens often lack Workers write permission.`)
  gap()

  head('Notes')
  gap()
  line(`- Zone args accept name (example.com) or zone ID (32-char hex)`)
  line(`- Zone IDs are cached in /tmp for 1 hour after first lookup`)
  line(`- Add ${C}-j${X} to any command for raw JSON (full CF API response)`)
  line(`- Default output is aligned table (arrays) or key-value (objects)`)
  line(`- Env files: config/cf-api.env > cf-api.env > .env > ~/.env`)
  line(`- No REST jargon: uses get/list/create/update/edit/delete`)
  line(`- Deploy bundles TS with esbuild (preferred) or bun (fallback)`)
  line(`- Deploy uploads via CF multipart API (single PUT, creates version + deployment)`)
  line(`- Deploy sets routes per zone and cron triggers automatically`)
  line(`- Deps: commander (CLI), smol-toml (TOML parsing). That's it.`)
  gap()
}

// --- register command ---

export function register(program) {
  program
    .command('install')
    .aliases(['setup', 'doctor', 'check'])
    .description(`Check setup: auth, permissions, tools, config.

  Examples:
    cf-api install
    cf-api doctor
    cf-api check`)
    .action(async () => {
      try {
        const auth = await checkAuth()
        const perms = await checkPermissions(auth)
        checkTools()
        checkConfig()
        printNotes()
        process.stderr.write('\n')
      } catch (e) {
        process.stderr.write(`\nerror: ${e.message}\n`)
        process.exit(1)
      }
    })
}
