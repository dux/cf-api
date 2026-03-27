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
- **Smart auth** - loads `.env` from cwd and `~/.env`, worker commands prefer Global API Key
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
| `pages` | Pages | Static site hosting with edge functions |
| `tunnels` | Tunnel | Expose local services through CF network (replaces VPN) |
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

Set environment variables in your shell profile or `.env` file (loaded automatically from cwd or `~/.env`):

```bash
# Option 1: API Token (recommended for read operations)
export CF_API_TOKEN="your-token"

# Option 2: Global API Key (full permissions, required for deploy/workers)
export CF_API_KEY="your-global-key"
export CF_API_EMAIL="your-email@example.com"

# Optional: skip account ID auto-detection
export CF_ACCOUNT_ID="your-account-id"
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

R2 is S3-compatible object storage with zero egress fees. Use it for files, images, backups, static assets. Works with any S3 client.

```bash
cf-api r2 list ACCOUNT_ID
cf-api r2 create ACCOUNT_ID my-bucket
cf-api r2 del ACCOUNT_ID my-bucket
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
