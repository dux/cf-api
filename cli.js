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
import { register as queues } from './lib/commands/queues.js'
import { register as analytics } from './lib/commands/analytics.js'
import { register as rules } from './lib/commands/rules.js'
import { register as logpush } from './lib/commands/logpush.js'
import { register as certs } from './lib/commands/certs.js'
import { register as email } from './lib/commands/email.js'
import { register as registrar } from './lib/commands/registrar.js'
import { register as healthchecks } from './lib/commands/healthchecks.js'
import { register as ai } from './lib/commands/ai.js'

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
    deploy         deploy worker (serverless function) from wrangler.toml
    zones          domains on your account (alias: domains)
    dns            DNS records for a zone
    purge          CDN cache purge (all or by URL)
    ssl            TLS/SSL certificates and encryption mode
    firewall       WAF rules, IP access rules (alias: fw)
    tail           live log stream from a worker
    secret         encrypted env vars for workers
    deployments    deploy history, versions, rollback
    workers        serverless scripts on CF edge
    kv             KV - global key-value store
    r2             R2 - S3-compatible object storage
    d1             D1 - serverless SQL database (SQLite)
    queues         message queues between workers
    pages          Pages - static site hosting + functions
    tunnels        Tunnel - expose local services via CF network
    analytics      zone & worker traffic stats
    rules          page rules, redirects, rulesets
    logpush        push logs to R2/S3/Datadog/Splunk
    certs          origin CA + client certificates
    email          email routing & forwarding
    registrar      domain registration management
    healthchecks   origin server health monitoring
    accounts       list accounts
    user           current user
    ips            Cloudflare edge IP ranges
    install        check auth, tools, config
    ai             ask AI to run cf-api commands for you

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
queues(program)
analytics(program)
rules(program)
logpush(program)
certs(program)
email(program)
registrar(program)
healthchecks(program)
ai(program)
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

  ${B}deploy${X}          ${D}deploy worker (serverless fn)${X}    ${B}ssl${X}           ${D}TLS certs + encryption mode${X}
  ${B}zones${X}|domains   ${D}domains on your account${X}          ${B}firewall${X}|fw   ${D}WAF + IP access rules${X}
  ${B}dns${X}             ${D}DNS records${X}                      ${B}pages${X}         ${D}static site hosting${X}
  ${B}purge${X}           ${D}CDN cache purge${X}                  ${B}tunnels${X}       ${D}expose local via CF${X}
  ${B}workers${X}|worker  ${D}serverless edge scripts${X}          ${B}accounts${X}      ${D}list accounts${X}
  ${B}tail${X}|logs       ${D}live worker log stream${X}           ${B}user${X}|me       ${D}current user info${X}
  ${B}secret${X}          ${D}encrypted worker env vars${X}        ${B}ips${X}           ${D}CF edge IP ranges${X}
  ${B}deployments${X}     ${D}history + rollback${X}               ${B}analytics${X}|stats ${D}traffic stats${X}
  ${B}kv${X}              ${D}global key-value store${X}            ${B}rules${X}         ${D}page rules + redirects${X}
  ${B}r2${X}              ${D}S3-compatible object storage${X}      ${B}logpush${X}       ${D}push logs to R2/S3/etc${X}
  ${B}d1${X}              ${D}serverless SQL database${X}           ${B}certs${X}         ${D}origin CA + client certs${X}
  ${B}queues${X}|queue    ${D}message queues${X}                   ${B}email${X}|mail    ${D}email routing + forwarding${X}
  ${B}healthchecks${X}    ${D}origin health monitoring${X}          ${B}registrar${X}     ${D}domain registration${X}
  ${B}install${X}|doctor  ${D}check auth, tools, config${X}       ${B}ai${X}            ${D}AI runs cf-api for you${X}

  ${D}cf-api <command> -h     detailed help for a command${X}
  ${D}cf-api --help           full help with all options${X}
  ${D}cf-api install           setup check + auth guide${X}
`)
  process.exit(0)
}

program.parse()

