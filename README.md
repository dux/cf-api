# cf-api

**Replaces: wrangler + flarectl + curl**

The Cloudflare tooling ecosystem is fragmented - `wrangler` handles Workers/Pages but not DNS or firewall, `flarectl` covers DNS but not Workers, and anything else requires raw `curl` against the API with manual JSON. You end up juggling 3 tools with 3 different auth setups and 3 different output formats.

`cf-api` is one CLI for the full Cloudflare API. Every service - DNS, Workers, KV, R2, D1, Pages, Tunnels, SSL, WAF - under a single consistent interface. Human verbs (`get`, `list`, `create`, `edit`, `delete`) instead of REST methods. Table output by default, `-j` for raw JSON. And `cf-api raw` gives you direct access to any CF API endpoint - nothing is locked out.

## Design

- **Single tool** - one CLI for everything, replaces wrangler + flarectl + curl
- **No REST jargon** - human verbs (get, create, edit, delete) not HTTP methods
- **Raw power** - `cf-api raw` gives access to any CF API endpoint, nothing is out of reach
- **Table output** - readable tables by default, `-j` for JSON when you need it
- **Minimal deps** - commander (CLI framework) + smol-toml (TOML parsing). That's it.
- **ESM** - `"type": "module"`, works on Node 18+ and Bun
- **Smart auth** - loads `config/cf-api.env`, `cf-api.env`, `.env`, `~/.env` (first match wins per var)
- **Zone caching** - zone name-to-ID lookups cached in `/tmp` for 1 hour

## What it covers

| Command | Cloudflare service | What it is |
|---|---|---|
| `raw` | Any endpoint | Direct access to the full CF API |
| `deploy` | Workers | Deploy serverless functions to CF edge |
| `zones` | Zones | Domains on your account (alias: `domains`) |
| `dns` | DNS | DNS records for a zone |
| `purge` | CDN | Cache purge - all or specific URLs |
| `ssl` | SSL/TLS | Certificates and encryption mode (off/flexible/full/strict) |
| `firewall` | WAF | Web Application Firewall rules + IP access rules |
| `workers` | Workers | Serverless scripts running on CF edge network |
| `tail` | Workers | Live log streaming from a running worker |
| `secret` | Workers | Encrypted environment variables for workers |
| `deployments` | Workers | Deployment history, versions, rollback |
| `kv` | Workers KV | Global low-latency key-value store |
| `r2` | R2 | S3-compatible object storage (no egress fees) |
| `d1` | D1 | Serverless SQL database (SQLite at the edge) |
| `queues` | Queues | Durable message queues between workers |
| `pages` | Pages | Static site hosting with edge functions |
| `tunnels` | Tunnel | Expose local services through CF network (replaces VPN) |
| `analytics` | Analytics | Zone & worker traffic stats (requests, bandwidth, errors) |
| `rules` | Rules | Page rules, redirect rules, rulesets |
| `logpush` | Logpush | Push logs to R2, S3, Datadog, Splunk |
| `certs` | Certificates | Origin CA certs + client certs (mTLS) |
| `email` | Email Routing | Forward emails to addresses or workers |
| `registrar` | Registrar | Domain registration at cost, WHOIS privacy |
| `healthchecks` | Healthchecks | Monitor origin server health (HTTP/HTTPS/TCP) |
| `accounts` | Accounts | List CF accounts |
| `user` | User | Current user info |
| `ips` | Network | Cloudflare edge IP ranges |
| `install` | - | Check auth, permissions, tools, config |

## Install

```bash
git clone https://github.com/dux/cf-api.git
cd cf-api
npm install
npm link
```

Requires Node 18+ (native fetch). For `cf-api deploy`, you also need [esbuild](https://esbuild.github.io/) or [bun](https://bun.sh/) for TypeScript bundling.

## Auth

Set environment variables in your shell profile or an env file. Files are loaded automatically in this order (first match wins per variable):

1. `./config/cf-api.env` - project config directory
2. `./cf-api.env` - project root
3. `./.env` - generic dotenv
4. `~/.env` - global fallback

```bash
# Option 1: API Token (recommended for read operations)
CF_API_TOKEN="your-token"

# Option 2: Global API Key (full permissions, required for deploy/workers)
CF_API_KEY="your-global-key"
CF_API_EMAIL="your-email@example.com"

# Optional: skip account ID auto-detection
CF_ACCOUNT_ID="your-account-id"

# R2 object operations (S3-compatible API - separate from CF API auth)
# Generate at: CF dashboard > R2 > Manage R2 API Tokens
R2_ACCESS_KEY_ID="your-r2-access-key"
R2_SECRET_ACCESS_KEY="your-r2-secret-key"
R2_BUCKET="my-bucket"              # default bucket for object commands
R2_URL="https://cdn.example.com"         # public URL base (for upload-sha1 output)
```

**Important:** API tokens often lack Workers write permissions. `cf-api deploy` and all worker-related commands (tail, secret, deployments) prefer Global API Key auth when both are set. If you only have a token and deploy fails with auth errors, add `CF_API_KEY` + `CF_API_EMAIL`.

Run `cf-api install` to verify your setup.

## Usage

```
cf-api                     compact command overview
cf-api --help              full help with all options
cf-api <command> -h        detailed help for a command
cf-api install             check auth, permissions, tools
```

### Raw API access

Full access to any Cloudflare API endpoint. Path is relative to `https://api.cloudflare.com/client/v4/`. This means anything CF offers via API is reachable even if there's no shortcut command for it.

```bash
cf-api raw get zones
cf-api raw get zones?name=example.com
cf-api raw list zones/ZONE_ID/dns_records
cf-api raw create zones/ZONE_ID/dns_records '{"type":"A","name":"sub","content":"1.2.3.4"}'
cf-api raw edit zones/ZONE_ID/settings/ssl '{"value":"full"}'
cf-api raw delete zones/ZONE_ID/dns_records/RECORD_ID
cf-api raw list accounts/ACCT_ID/workers/scripts
cf-api raw get user/tokens/verify
```

Verb mapping (no REST jargon):
- `get`, `list`, `read` - GET (read data)
- `create`, `add` - POST (create resource)
- `update`, `set` - PUT (replace resource)
- `edit`, `patch` - PATCH (partial update)
- `delete`, `del`, `rm` - DELETE (remove resource)

### Deploy

Deploy a Cloudflare Worker (serverless function) from `wrangler.toml` or `wrangler.json`. Config is looked up in current directory and `config/` subdirectory.

```bash
cf-api deploy                              # from current directory
cf-api deploy --config path/wrangler.toml  # explicit config
cf-api deploy --account ACCOUNT_ID         # specify account
```

What it does:
1. Reads config (name, main, routes, bindings, vars, crons)
2. Bundles TypeScript with esbuild or bun
3. Uploads via Cloudflare Workers multipart API
4. Sets zone routes
5. Sets cron triggers

### Zones (domains)

Zones are domains registered on your CF account. Each zone has DNS records, SSL settings, firewall rules, etc.

```bash
cf-api zones list                  # list all zones
cf-api zones list example.com      # filter by name
cf-api zones get example.com       # zone details
cf-api zones settings example.com  # all zone settings
cf-api domains list                # alias for zones list
```

Zone arguments accept domain name (`example.com`) or zone ID (32-char hex). Zone IDs are cached in `/tmp` for 1 hour.

### DNS

Manage DNS records for any zone. Supports all record types (A, AAAA, CNAME, MX, TXT, SRV, NS, CAA, etc).

```bash
cf-api dns list example.com
cf-api dns list example.com --type A
cf-api dns list example.com --name sub.example.com
cf-api dns get example.com RECORD_ID
cf-api dns add example.com A sub 1.2.3.4
cf-api dns add example.com A sub 1.2.3.4 --proxy     # orange cloud (CF proxy)
cf-api dns add example.com MX example.com mail.example.com --priority 10
cf-api dns add example.com TXT example.com "v=spf1 include:_spf.google.com ~all"
cf-api dns edit example.com RECORD_ID --content 5.6.7.8
cf-api dns del example.com RECORD_ID
cf-api dns export example.com         # BIND zone file
cf-api dns import example.com zone.txt
```

### Cache (CDN purge)

Cloudflare caches your site content at 300+ edge locations worldwide. Purge when you deploy changes.

```bash
cf-api purge example.com                    # purge everything
cf-api purge example.com https://example.com/style.css https://example.com/app.js
```

### SSL/TLS

Manage encryption between visitors and your origin server. Modes: `off`, `flexible` (CF-to-visitor only), `full` (end-to-end), `strict` (end-to-end with valid cert).

```bash
cf-api ssl list example.com        # certificate packs
cf-api ssl status example.com      # verification status
cf-api ssl setting example.com     # current SSL mode
cf-api ssl set example.com strict  # off | flexible | full | strict
```

### Firewall (WAF)

Web Application Firewall - protect your site from attacks. Manage rules, WAF packages, and IP access lists.

```bash
cf-api firewall rules example.com
cf-api firewall waf example.com
cf-api firewall access-rules example.com
```

### Workers (serverless functions)

Workers are serverless functions that run on Cloudflare's edge network (300+ locations). They execute JavaScript/TypeScript with sub-millisecond cold starts.

```bash
cf-api workers list ACCOUNT_ID
cf-api workers get ACCOUNT_ID my-worker      # download source
cf-api workers del ACCOUNT_ID my-worker
cf-api workers routes example.com            # routes for a zone
cf-api workers subdomain ACCOUNT_ID          # your workers.dev subdomain
```

### Tail (live worker logs)

Stream real-time logs from a running Worker via WebSocket. Shows console.log output, HTTP requests, errors, and exceptions.

```bash
cf-api tail ACCOUNT_ID my-worker
cf-api tail ACCOUNT_ID my-worker --format json
cf-api tail ACCOUNT_ID my-worker --status error
cf-api tail ACCOUNT_ID my-worker --search "user"
cf-api tail ACCOUNT_ID my-worker --method GET --method POST
cf-api tail ACCOUNT_ID my-worker --ip self
cf-api tail ACCOUNT_ID my-worker --sample 0.1    # 10% of requests
```

### Secrets (worker env vars)

Encrypted environment variables for Workers. Unlike plain text vars in wrangler.toml, secrets are encrypted at rest and not visible after setting.

```bash
cf-api secret list ACCOUNT_ID my-worker
cf-api secret set ACCOUNT_ID my-worker SECRET_NAME "secret-value"
cf-api secret del ACCOUNT_ID my-worker SECRET_NAME
```

### Deployments & Rollback

View deployment history and roll back to any previous version of a Worker.

```bash
cf-api deployments list ACCOUNT_ID my-worker        # recent deployments
cf-api deployments versions ACCOUNT_ID my-worker     # all versions
cf-api deployments get ACCOUNT_ID my-worker VER_ID   # version detail
cf-api deployments rollback ACCOUNT_ID my-worker VER_ID
cf-api deployments rollback ACCOUNT_ID my-worker VER_ID -m "reason"
```

### KV (key-value store)

Workers KV is a global, low-latency key-value store. Data is eventually consistent and replicated to all CF edge locations. Good for config, feature flags, user sessions.

```bash
cf-api kv ns ACCOUNT_ID                          # list namespaces
cf-api kv keys ACCOUNT_ID NAMESPACE_ID            # list keys
cf-api kv keys ACCOUNT_ID NAMESPACE_ID --prefix user:
cf-api kv get ACCOUNT_ID NAMESPACE_ID mykey
cf-api kv set ACCOUNT_ID NAMESPACE_ID mykey "value"
cf-api kv del ACCOUNT_ID NAMESPACE_ID mykey
```

### R2 (object storage)

R2 is S3-compatible object storage with zero egress fees. Use it for files, images, backups, static assets.

Bucket management uses standard CF API auth. Object operations use a separate R2 S3 token (generate at CF dashboard > R2 > Manage R2 API Tokens).

Account ID and bucket are resolved from `--account`/`-a` and `--bucket`/`-b` flags, or from `CF_ACCOUNT_ID` and `R2_BUCKET` env vars. Set them once in your env file and skip repeating them on every call.

```bash
# bucket management (CF_API_TOKEN or CF_API_KEY)
cf-api r2 list                             # list buckets
cf-api r2 info my-bucket                   # bucket details
cf-api r2 create my-bucket                 # create bucket
cf-api r2 del my-bucket                    # delete bucket
cf-api r2 cors my-bucket                   # CORS policy
cf-api r2 metrics                          # account R2 usage

# object operations (R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY)
cf-api r2 objects                          # list all objects in R2_BUCKET
cf-api r2 objects uploads/                 # filter by prefix
cf-api r2 cat path/to/file.txt             # print to stdout
cf-api r2 put path/to/remote.txt ./local   # upload file
cf-api r2 rm path/to/file.txt              # delete object

# content-addressed upload (SHA1 hash as key)
cf-api r2 upload-sha1 ./photo.jpg          # -> hash/a1b2c3...jpg
cf-api r2 upload-sha1 https://example.com/img.png  # download + upload
cf-api r2 sha1 ./data.json                 # alias for upload-sha1

# override account/bucket per-call
cf-api r2 -a ACCT_ID -b other-bucket objects
cf-api r2 objects --account ACCT_ID --bucket other-bucket
```

The `upload-sha1` command computes the SHA1 hash of the file content and uploads to `hash/<sha1><ext>`. Same file from any source always lands at the same key - useful for deduplication. Accepts local file paths or HTTP(S) URLs. If `R2_URL` is set, the public URL is printed after upload.

R2 env vars:
```bash
R2_ACCESS_KEY_ID=your-access-key        # required for object ops
R2_SECRET_ACCESS_KEY=your-secret-key    # required for object ops
R2_BUCKET=my-bucket                     # default bucket (skip --bucket)
R2_URL=https://cdn.example.com          # public URL base (upload-sha1 output)
```

### D1 (SQL database)

D1 is a serverless SQL database built on SQLite. Runs at the edge with automatic replication. Execute queries, export/import data.

```bash
cf-api d1 list ACCOUNT_ID
cf-api d1 info ACCOUNT_ID my-db
cf-api d1 create ACCOUNT_ID my-db
cf-api d1 del ACCOUNT_ID my-db
cf-api d1 query ACCOUNT_ID my-db "SELECT * FROM users LIMIT 10"
cf-api d1 export ACCOUNT_ID my-db
cf-api d1 export ACCOUNT_ID my-db --no-data    # schema only
cf-api d1 export ACCOUNT_ID my-db --no-schema  # data only
```

D1 accepts database name or UUID. Names are resolved automatically.

### Pages (static sites)

Cloudflare Pages is a JAMstack platform for deploying static sites with optional edge functions. Git-integrated with preview deployments.

```bash
cf-api pages list ACCOUNT_ID
cf-api pages get ACCOUNT_ID my-site
cf-api pages deployments ACCOUNT_ID my-site
```

### Tunnels

Cloudflare Tunnel creates encrypted tunnels from your local network to CF edge without opening inbound ports. Replaces VPNs for exposing internal services.

```bash
cf-api tunnels list ACCOUNT_ID
cf-api tunnels get ACCOUNT_ID TUNNEL_ID
cf-api tunnels del ACCOUNT_ID TUNNEL_ID
cf-api tunnels config ACCOUNT_ID TUNNEL_ID
```

### Queues (message queues)

Cloudflare Queues provide durable, at-least-once message delivery between Workers. Producers send messages, consumers process them in batches.

```bash
cf-api queues list ACCOUNT_ID
cf-api queues get ACCOUNT_ID my-queue
cf-api queues create ACCOUNT_ID my-queue
cf-api queues del ACCOUNT_ID my-queue
cf-api queues consumers ACCOUNT_ID my-queue           # list consumers
cf-api queues add-consumer ACCOUNT_ID my-queue my-worker
cf-api queues add-consumer ACCOUNT_ID my-queue my-worker --batch 50 --retries 5
cf-api queues del-consumer ACCOUNT_ID my-queue CONSUMER_ID
cf-api queues send ACCOUNT_ID my-queue '{"event":"test"}'
cf-api queues purge ACCOUNT_ID my-queue
```

Queues accept queue name or queue ID. Names are resolved automatically.

### Analytics (traffic stats)

View request counts, bandwidth, threats, status codes, and more for zones and workers.

```bash
cf-api analytics zone example.com                  # last 24h summary
cf-api analytics zone example.com --since -10080   # last 7 days (minutes)
cf-api analytics dns example.com                   # DNS query analytics
cf-api analytics worker ACCOUNT_ID my-worker       # worker request/error stats
```

### Rules (page rules, redirects, rulesets)

Page rules are legacy URL-based actions (forwarding, caching, SSL mode). Rulesets are the modern rule engine for redirects, transforms, and rate limiting.

```bash
cf-api rules page list example.com
cf-api rules page get example.com RULE_ID
cf-api rules page create example.com "*.example.com/*" forwarding_url=301:https://new.com/$2
cf-api rules page del example.com RULE_ID
cf-api rules rulesets example.com                  # list all rulesets
cf-api rules ruleset example.com RULESET_ID        # get ruleset details
cf-api rules redirects example.com                 # list redirect rules
cf-api rules redirect-add example.com /old /new 301
```

### Logpush (log export)

Push Cloudflare logs to external storage - R2, S3, Datadog, Splunk, and more. Stream HTTP requests, firewall events, worker traces.

```bash
cf-api logpush list example.com
cf-api logpush get example.com JOB_ID
cf-api logpush datasets example.com                # available log datasets
cf-api logpush fields example.com http_requests    # fields for a dataset
cf-api logpush create example.com --dataset http_requests --dest r2://bucket/logs
cf-api logpush edit example.com JOB_ID --enabled false
cf-api logpush del example.com JOB_ID
```

### Certificates (origin CA + client certs)

Origin CA certificates are signed by Cloudflare and trusted by the CF proxy - use them on your origin server for full/strict SSL. Client certificates enable mTLS for API Shield.

```bash
cf-api certs origin list example.com
cf-api certs origin get CERT_ID
cf-api certs origin create example.com --hostnames example.com,*.example.com
cf-api certs origin create example.com --hostnames api.example.com --days 365
cf-api certs origin revoke CERT_ID
cf-api certs client list example.com
cf-api certs client create example.com --csr ./client.csr --days 3650
cf-api certs client revoke example.com CERT_ID
```

**Warning:** Origin CA private keys are shown only once at creation time. Use `-j` to get the full PEM output and save it immediately.

### Email Routing

Route incoming email by address or catch-all rule. No mail server needed - just forward to existing addresses or process with Workers.

```bash
cf-api email settings example.com                  # routing status
cf-api email rules list example.com
cf-api email rules create example.com info@example.com dest@gmail.com
cf-api email rules del example.com RULE_ID
cf-api email catch-all example.com                 # view catch-all rule
cf-api email catch-all-set example.com dest@gmail.com
cf-api email catch-all-set example.com drop         # discard unmatched
cf-api email addresses list example.com             # verified destinations
cf-api email addresses add example.com dest@gmail.com
```

### Registrar (domain registration)

Cloudflare Registrar offers at-cost domain registration with no markup. WHOIS privacy included.

```bash
cf-api registrar list ACCOUNT_ID
cf-api registrar get ACCOUNT_ID example.com
cf-api registrar check ACCOUNT_ID example.com       # check availability
cf-api registrar update ACCOUNT_ID example.com --auto-renew true
cf-api registrar update ACCOUNT_ID example.com --locked true
cf-api registrar contacts ACCOUNT_ID
```

### Healthchecks (origin monitoring)

Periodic health checks from Cloudflare edge to your origin server. Supports HTTP, HTTPS, and TCP. Get notified when your origin goes down.

```bash
cf-api healthchecks list example.com
cf-api healthchecks get example.com CHECK_ID
cf-api healthchecks create example.com --name "API check" --address api.example.com
cf-api healthchecks create example.com --name "TCP DB" --address db.example.com --port 5432 --type TCP
cf-api healthchecks edit example.com CHECK_ID --interval 120
cf-api healthchecks del example.com CHECK_ID
cf-api healthchecks preview example.com CHECK_ID     # run one-time check
```

### Account & User

```bash
cf-api accounts    # list CF accounts
cf-api user        # current user info (alias: me)
cf-api ips         # Cloudflare edge IP ranges (useful for firewall allowlists)
```

## Output

Default output is aligned tables (for arrays) or key-value pairs (for objects). Add `-j` to any command for raw JSON:

```bash
cf-api zones list              # table
cf-api zones list -j           # raw JSON
cf-api dns list example.com -j # raw JSON
```

## License

MIT
