#!/usr/bin/env node

// cf-api - Cloudflare API tool
// Raw access to any endpoint + workflow shortcuts for common operations.
//   Auth: set CF_API_TOKEN env var (or CF_API_KEY + CF_API_EMAIL for legacy).
// Default output is table. Add -j for JSON.
// Binary: cf-api (npm link to install globally)

import { Command } from 'commander'
import { setJsonMode } from './lib/api.js'

import { register as raw } from './lib/commands/raw.js'
import { register as zones } from './lib/commands/zones.js'
import { register as dns } from './lib/commands/dns.js'
import { register as purge } from './lib/commands/purge.js'
import { register as ssl } from './lib/commands/ssl.js'
import { register as firewall } from './lib/commands/firewall.js'
import { register as kv } from './lib/commands/kv.js'
import { register as r2 } from './lib/commands/r2.js'
import { register as workers } from './lib/commands/workers.js'
import { register as pages } from './lib/commands/pages.js'
import { register as tunnels } from './lib/commands/tunnels.js'
import { register as accounts } from './lib/commands/accounts.js'
import { registerUser, registerIps } from './lib/commands/user.js'
import { register as deploy } from './lib/commands/deploy.js'
import { register as install } from './lib/commands/install.js'
import { register as secret } from './lib/commands/secret.js'
import { register as d1 } from './lib/commands/d1.js'
import { register as tail } from './lib/commands/tail.js'
import { register as deployments } from './lib/commands/deployments.js'

const program = new Command()

program
  .name('cf-api')
  .version('1.0.0')
  .option('-j, --json', 'output raw JSON instead of table')
  .description(`Cloudflare API tool - raw access + workflow shortcuts.

  Auth: CF_API_TOKEN or CF_API_KEY + CF_API_EMAIL
  Output: table default, -j for JSON
  Zones: accept name (example.com) or ID (32-char hex)

  Raw API:
    cf-api raw get <path>            read
    cf-api raw create <path> [body]  POST
    cf-api raw edit <path> [body]    PATCH
    cf-api raw delete <path>         DELETE

  Shortcuts:
    deploy         deploy worker from wrangler.toml
    zones          list/get/settings (alias: domains)
    dns            list/get/add/edit/del/export/import
    purge          cache purge (all or by URL)
    ssl            list/status/setting/set
    firewall       rules/waf/access-rules (alias: fw)
    tail           live log streaming from a worker
    secret         list/set/del worker secrets
    deployments    list/versions/rollback
    workers        list/get/del/routes/subdomain
    kv             ns/keys/get/set/del
    r2             list/create/del
    d1             list/create/del/query/export
    pages          list/get/deployments
    tunnels        list/get/del/config
    accounts       list accounts
    user           current user
    ips            CF IP ranges
    install        check auth, tools, config

  Run cf-api <command> -h for details.
  Run cf-api install for setup check.`)

// set json mode before any command runs
program.hook('preAction', (thisCommand) => {
  const opts = thisCommand.optsWithGlobals()
  if (opts.json) setJsonMode(true)
})

// register all commands
install(program)
deploy(program)
raw(program)
zones(program)
dns(program)
purge(program)
ssl(program)
firewall(program)
kv(program)
r2(program)
workers(program)
pages(program)
tunnels(program)
accounts(program)
secret(program)
d1(program)
tail(program)
deployments(program)
registerUser(program)
registerIps(program)

// add -j hint to every command and subcommand help
const hint = '\nAdd -j for raw JSON output.'
function addHints(cmd) {
  cmd.addHelpText('after', hint)
  for (const sub of cmd.commands) addHints(sub)
}
addHints(program)

// no args: compact output instead of full commander help
const args = process.argv.slice(2)
if (args.length === 0) {
  const D = '\x1b[2m'
  const B = '\x1b[1m'
  const C = '\x1b[36m'
  const X = '\x1b[0m'
  process.stderr.write(`
  ${B}cf-api${X} - Cloudflare API tool ${D}v1.0.0 by @dux${X}
  ${D}https://github.com/dux/cf-api${X}

  ${B}raw${X}  ${C}get${X}|${C}list${X}|${C}create${X}|${C}update${X}|${C}edit${X}|${C}delete${X} <path> [body]   ${D}any CF endpoint${X}

  ${B}deploy${X}          ${D}worker from wrangler.toml${X}        ${B}accounts${X}     ${D}list accounts${X}
  ${B}zones${X}|domains   ${D}list/get/settings${X}                ${B}user${X}|me      ${D}current user${X}
  ${B}dns${X}             ${D}list/add/edit/del/export${X}         ${B}ips${X}          ${D}CF IP ranges${X}
  ${B}purge${X}           ${D}cache purge${X}                      ${B}ssl${X}          ${D}certs + mode${X}
  ${B}workers${X}|worker  ${D}list/get/del/routes${X}              ${B}firewall${X}|fw  ${D}rules/waf${X}
  ${B}tail${X}|logs       ${D}live worker log stream${X}           ${B}pages${X}        ${D}list/get/deploys${X}
  ${B}secret${X}          ${D}worker secrets${X}                   ${B}tunnels${X}      ${D}list/get/del/config${X}
  ${B}deployments${X}     ${D}list/versions/rollback${X}           ${B}d1${X}           ${D}SQL database${X}
  ${B}kv${X}              ${D}ns/keys/get/set/del${X}              ${B}r2${X}           ${D}buckets${X}
  ${B}install${X}|doctor  ${D}check auth, tools, config${X}

  ${D}cf-api <command> -h     detailed help for a command${X}
  ${D}cf-api --help           full help with all options${X}
  ${D}cf-api install           setup check + auth guide${X}
`)
  process.exit(0)
}

program.parse()

