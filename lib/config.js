// Config loader for wrangler.toml / wrangler.json
// Finds and parses deploy config, returns normalized object.

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { parse as parseToml } from 'smol-toml'

// Find config file. Priority: explicit path > wrangler.toml > wrangler.json
export function findConfig(explicitPath) {
  if (explicitPath) {
    const p = resolve(explicitPath)
    if (!existsSync(p)) return { error: `config not found: ${explicitPath}` }
    return { path: p }
  }

  const cwd = process.cwd()
  for (const dir of [cwd, resolve(cwd, 'config')]) {
    for (const name of ['wrangler.toml', 'wrangler.json', 'wrangler.jsonc']) {
      const p = resolve(dir, name)
      if (existsSync(p)) return { path: p }
    }
  }

  return {
    error: `no wrangler.toml or wrangler.json in ${cwd}

create wrangler.toml:

  name = "my-worker"
  main = "src/index.ts"
  compatibility_date = "${new Date().toISOString().split('T')[0]}"

  routes = [{ pattern = "example.com/*", zone_name = "example.com" }]

  [vars]
  MY_VAR = "value"`
  }
}

// Parse config file into normalized object
export function loadConfig(configPath) {
  const raw = readFileSync(configPath, 'utf8')
  let cfg

  if (configPath.endsWith('.toml')) {
    try {
      cfg = parseToml(raw)
    } catch (e) {
      return { error: `failed to parse ${configPath}: ${e.message}` }
    }
  } else {
    try {
      // strip jsonc comments
      const clean = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
      cfg = JSON.parse(clean)
    } catch (e) {
      return { error: `failed to parse ${configPath}: ${e.message}` }
    }
  }

  // validate required fields
  if (!cfg.name) {
    return { error: `${configPath} missing 'name'. add:\n  name = "my-worker"` }
  }
  if (!cfg.main) {
    return { error: `${configPath} missing 'main'. add:\n  main = "src/index.ts"` }
  }

  // normalize
  const config = {
    name: cfg.name,
    main: resolve(dirname(configPath), cfg.main),
    compatibilityDate: cfg.compatibility_date || new Date().toISOString().split('T')[0],
    compatibilityFlags: cfg.compatibility_flags || [],
    minify: cfg.minify !== false,
    routes: [],
    bindings: [],
    crons: [],
    configPath,
  }

  // routes
  if (cfg.routes) {
    config.routes = cfg.routes.map(r => {
      if (typeof r === 'string') return { pattern: r }
      return { pattern: r.pattern, zoneName: r.zone_name }
    })
  } else if (cfg.route) {
    config.routes = [{ pattern: cfg.route }]
  }

  // r2 buckets -> bindings
  const r2 = cfg.r2_buckets || cfg['[[r2_buckets]]']
  if (Array.isArray(r2)) {
    for (const b of r2) {
      config.bindings.push({
        type: 'r2_bucket',
        name: b.binding,
        bucket_name: b.bucket_name,
      })
    }
  }

  // kv namespaces -> bindings
  const kv = cfg.kv_namespaces
  if (Array.isArray(kv)) {
    for (const k of kv) {
      config.bindings.push({
        type: 'kv_namespace',
        name: k.binding,
        namespace_id: k.id,
      })
    }
  }

  // d1 databases -> bindings
  const d1 = cfg.d1_databases
  if (Array.isArray(d1)) {
    for (const d of d1) {
      config.bindings.push({
        type: 'd1',
        name: d.binding,
        id: d.database_id,
      })
    }
  }

  // services -> bindings
  const services = cfg.services
  if (Array.isArray(services)) {
    for (const s of services) {
      config.bindings.push({
        type: 'service',
        name: s.binding,
        service: s.service,
      })
    }
  }

  // plain text vars -> bindings
  if (cfg.vars) {
    for (const [key, val] of Object.entries(cfg.vars)) {
      config.bindings.push({
        type: 'plain_text',
        name: key,
        text: String(val),
      })
    }
  }

  // cron triggers
  if (cfg.triggers?.crons) {
    config.crons = cfg.triggers.crons
  }

  return { config }
}
