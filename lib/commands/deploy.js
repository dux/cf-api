import { readFileSync, existsSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { api as _api, zoneId as _zoneId, die } from '../api.js'
import { findConfig, loadConfig } from '../config.js'

// Deploy-specific API call that prefers legacy key auth (broader permissions).
// Falls through to token auth if no key is set.
const BASE = 'https://api.cloudflare.com/client/v4'

function deployAuthHeaders() {
  const key = process.env.CF_API_KEY
  const email = process.env.CF_API_EMAIL
  if (key && email) return { 'X-Auth-Key': key, 'X-Auth-Email': email }

  const token = process.env.CF_API_TOKEN
  if (token) return { Authorization: `Bearer ${token}` }

  die('set CF_API_TOKEN (or CF_API_KEY + CF_API_EMAIL) for deploy')
}

async function api(method, path, body) {
  let url = path.startsWith('http') ? path : `${BASE}/${path.replace(/^\//, '')}`
  const headers = { ...deployAuthHeaders(), 'Content-Type': 'application/json' }
  const opts = { method: method.toUpperCase(), headers }
  if (body !== undefined && body !== null) {
    opts.body = typeof body === 'string' ? body : JSON.stringify(body)
  }
  const res = await fetch(url, opts)
  const ct = res.headers.get('content-type') || ''
  return ct.includes('application/json') ? res.json() : res.text()
}

async function zoneId(name) {
  if (/^[0-9a-f]{32}$/.test(name)) return name
  const resp = await api('GET', `zones?name=${name}&per_page=1`)
  const id = resp.result?.[0]?.id
  if (!id) throw new Error(`zone '${name}' not found`)
  return id
}

// --- helpers ---

function log(label, msg) {
  const pad = label.padStart(10)
  process.stderr.write(`  \x1b[36m${pad}\x1b[0m  ${msg}\n`)
}

function logOk(label, msg) {
  const pad = label.padStart(10)
  process.stderr.write(`  \x1b[32m${pad}\x1b[0m  ${msg}\n`)
}

function logErr(label, msg) {
  const pad = label.padStart(10)
  process.stderr.write(`  \x1b[31m${pad}\x1b[0m  ${msg}\n`)
}

// --- account resolution ---

async function resolveAccountId(explicit) {
  if (explicit) return explicit
  if (process.env.CF_ACCOUNT_ID) return process.env.CF_ACCOUNT_ID

  // try accounts API
  const resp = await api('GET', 'accounts?per_page=50')
  const accounts = resp.result || []

  if (accounts.length === 1) {
    return accounts[0].id
  }

  if (accounts.length > 1) {
    const list = accounts.map(a => `  ${a.id}  ${a.name}`).join('\n')
    die(`multiple accounts found. pass --account <id> or set CF_ACCOUNT_ID:\n\n${list}`)
  }

  // accounts API returned empty - token may lack account:read.
  // fallback: get account ID from zones
  const zoneResp = await api('GET', 'zones?per_page=1')
  const zone = zoneResp.result?.[0]
  if (zone?.account?.id) {
    return zone.account.id
  }

  die(`could not detect account ID. set CF_ACCOUNT_ID env var or pass --account <id>.

find your account ID:
   cf-api zones get <any-zone-name>    (look for account.id)
  or check the Cloudflare dashboard URL: /dash.cloudflare.com/<account_id>`)
}

// --- bundler ---

function findBundler() {
  // check esbuild
  try {
    execSync('esbuild --version', { stdio: 'pipe' })
    return 'esbuild'
  } catch {}

  // check bun
  try {
    execSync('bun --version', { stdio: 'pipe' })
    return 'bun'
  } catch {}

  return null
}

function bundle(entryPoint, outFile, minify) {
  const ext = entryPoint.split('.').pop()
  const needsBundle = ['ts', 'tsx', 'jsx'].includes(ext)

  // check if it's a simple single JS file with no imports that need bundling
  if (!needsBundle) {
    const src = readFileSync(entryPoint, 'utf8')
    // if it has bare imports (not from node:), it needs bundling
    const hasImports = /^\s*import\s+.*from\s+['"][^.\/node:]/m.test(src)
    if (!hasImports) {
      return { content: src, bundled: false }
    }
  }

  const bundler = findBundler()
  if (!bundler) {
    die(`TypeScript/ESM bundling required but no bundler found.

install esbuild:
  npm install -g esbuild

or use bun (already a bundler):
  https://bun.sh`)
  }

  try {
    if (bundler === 'esbuild') {
      const flags = [
        entryPoint,
        '--bundle',
        '--format=esm',
        `--outfile=${outFile}`,
        '--target=esnext',
        '--platform=browser',
        "--external:node:*",
        "--external:cloudflare:*",
      ]
      if (minify) flags.push('--minify')
      execSync(`esbuild ${flags.join(' ')}`, { stdio: 'pipe' })
    } else {
      const flags = [
        'build', entryPoint,
        `--outfile=${outFile}`,
        '--format=esm',
        '--target=browser',
        '--external=node:*',
        '--external=cloudflare:*',
      ]
      if (minify) flags.push('--minify')
      execSync(`bun ${flags.join(' ')}`, { stdio: 'pipe' })
    }

    const content = readFileSync(outFile, 'utf8')
    return { content, bundled: true, bundler }
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString() : e.message
    die(`bundling failed:\n\n${msg}`)
  }
}

// --- upload via multipart API ---

async function uploadWorker(accountId, name, scriptContent, metadata) {
  const moduleName = 'worker.mjs'

  // Use native FormData - handles boundary + content-type automatically
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  form.append(moduleName, new Blob([scriptContent], { type: 'application/javascript+module' }), moduleName)

  const headers = deployAuthHeaders()
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${name}`
  const res = await fetch(url, { method: 'PUT', headers, body: form })
  return res.json()
}

// --- routes ---

async function setRoutes(config, accountId, workerName) {
  for (const route of config.routes) {
    if (!route.zoneName) {
      // try to extract zone from pattern (e.g. "img.example.com/*" -> "example.com")
      const host = route.pattern.replace(/\/\*$/, '').replace(/\*\./g, '')
      route.zoneName = host.split('.').slice(-2).join('.')
    }

    let zid
    try {
      zid = await zoneId(route.zoneName)
    } catch {
      logErr('route', `zone '${route.zoneName}' not found. check zone_name in routes config.`)
      continue
    }

    // check existing routes
    const existing = await api('GET', `zones/${zid}/workers/routes`)
    const match = (existing.result || []).find(r => r.pattern === route.pattern)

    if (match) {
      // update if script changed
      if (match.script !== workerName) {
        const resp = await api('PUT', `zones/${zid}/workers/routes/${match.id}`, {
          pattern: route.pattern,
          script: workerName,
        })
        if (resp.success) {
          logOk('route', `${route.pattern} (updated)`)
        } else {
          logErr('route', `failed to update ${route.pattern}: ${resp.errors?.[0]?.message || 'unknown error'}`)
        }
      } else {
        logOk('route', `${route.pattern} (exists)`)
      }
    } else {
      // create new route
      const resp = await api('POST', `zones/${zid}/workers/routes`, {
        pattern: route.pattern,
        script: workerName,
      })
      if (resp.success) {
        logOk('route', `${route.pattern} (created)`)
      } else {
        logErr('route', `failed to create ${route.pattern}: ${resp.errors?.[0]?.message || 'unknown error'}`)
      }
    }
  }
}

// --- cron triggers ---

async function setCrons(accountId, workerName, crons) {
  // body is a plain array, not wrapped in {schedules:...}
  const resp = await api('PUT', `accounts/${accountId}/workers/scripts/${workerName}/schedules`,
    crons.map(c => ({ cron: c }))
  )

  // some CF API versions use different response shape
  if (resp.success || resp.result) {
    for (const c of crons) logOk('cron', c)
  } else {
    logErr('cron', `failed: ${resp.errors?.[0]?.message || 'unknown error'}`)
  }
}

// --- main deploy action ---

async function deployAction(opts) {
  process.stderr.write('\n')

  // 1. find + load config
  const found = findConfig(opts.config)
  if (found.error) die(found.error)

  log('config', found.path)

  const loaded = loadConfig(found.path)
  if (loaded.error) die(loaded.error)
  const config = loaded.config

  log('name', config.name)
  log('entry', config.main)

  // 2. check entry point exists
  if (!existsSync(config.main)) {
    die(`entry point not found: ${config.main}\n\ncheck 'main' in your wrangler config.`)
  }

  // 3. resolve account
  let accountId
  try {
    accountId = await resolveAccountId(opts.account)
  } catch (e) {
    die(e.message)
  }
  log('account', accountId)

  // 4. bundle
  const outFile = resolve(tmpdir(), `cf-deploy-${config.name}.mjs`)
  const result = bundle(config.main, outFile, config.minify)

  const sizeKb = (Buffer.byteLength(result.content) / 1024).toFixed(1)
  if (result.bundled) {
    logOk('bundle', `${sizeKb} KB (${result.bundler})`)
  } else {
    logOk('bundle', `${sizeKb} KB (no bundling needed)`)
  }

  // 5. build metadata
  const metadata = {
    main_module: 'worker.mjs',
    compatibility_date: config.compatibilityDate,
    bindings: config.bindings,
  }
  if (config.compatibilityFlags.length > 0) {
    metadata.compatibility_flags = config.compatibilityFlags
  }

  // 6. upload
  log('upload', 'uploading...')
  let uploadResp
  try {
    uploadResp = await uploadWorker(accountId, config.name, result.content, metadata)
  } catch (e) {
    die(`upload failed: ${e.message}`)
  }

  if (!uploadResp.success) {
    const errors = (uploadResp.errors || []).map(e => e.message).join('\n  ')
    die(`upload failed:\n  ${errors}`)
  }

  logOk('upload', 'done')

  // 7. set routes
  if (config.routes.length > 0) {
    try {
      await setRoutes(config, accountId, config.name)
    } catch (e) {
      logErr('route', e.message)
    }
  }

  // 8. set cron triggers
  if (config.crons.length > 0) {
    try {
      await setCrons(accountId, config.name, config.crons)
    } catch (e) {
      logErr('cron', e.message)
    }
  }

  // 9. success summary
  process.stderr.write('\n')
  const domain = config.routes[0]?.pattern.replace(/\/\*$/, '')
  if (domain) {
    logOk('deployed', `https://${domain}/`)
  } else {
    logOk('deployed', config.name)
  }
  process.stderr.write('\n')
}

// --- register command ---

export function register(program) {
  program
    .command('deploy')
    .description(`Deploy a Cloudflare Worker from wrangler.toml / wrangler.json.

  Reads config from cwd (or --config path), bundles TypeScript with
  esbuild or bun, uploads via CF API, sets routes and cron triggers.

  Steps:
    1. Read wrangler.toml (name, main, routes, bindings, vars, crons)
    2. Bundle entry point (esbuild or bun build)
    3. Upload to Cloudflare Workers API
    4. Set zone routes
    5. Set cron triggers

  Requirements:
    - wrangler.toml or wrangler.json in project directory
    - esbuild or bun installed (for TypeScript bundling)
    - CF_API_TOKEN env var
    - CF_ACCOUNT_ID env var (or --account, or auto-detected if single account)

  Examples:
    cf-api deploy                              - deploy from current directory
    cf-api deploy --config path/wrangler.toml  - explicit config path
    cf-api deploy --account abc123             - specify account ID`)
    .option('-c, --config <path>', 'path to wrangler.toml or wrangler.json')
    .option('-a, --account <id>', 'Cloudflare account ID')
    .action(async (opts) => {
      try {
        await deployAction(opts)
      } catch (e) {
        die(e.message)
      }
    })
}
