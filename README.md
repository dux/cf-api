# cf-api

Single CLI for full Cloudflare API access. Raw API calls with human-friendly verbs + workflow shortcuts for common operations.

One tool instead of wrangler + flarectl + curl. No REST jargon - uses `get`, `list`, `create`, `update`, `edit`, `delete` instead of POST/PATCH/PUT/DELETE. Table output by default, `-j` for raw JSON.

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

Full access to any Cloudflare API endpoint. Path is relative to `https://api.cloudflare.com/client/v4/`.

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

Verb mapping:
- `get`, `list`, `read` - GET (read data)
- `create`, `add` - POST (create resource)
- `update`, `set` - PUT (replace resource)
- `edit`, `patch` - PATCH (partial update)
- `delete`, `del`, `rm` - DELETE (remove resource)

### Deploy

Deploy a Cloudflare Worker from `wrangler.toml` or `wrangler.json`. Looks in current directory and `config/` subdirectory.

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

### Zones

```bash
cf-api zones list                  # list all zones
cf-api zones list example.com      # filter by name
cf-api zones get example.com       # zone details
cf-api zones settings example.com  # all zone settings
cf-api domains list                # alias for zones list
```

Zone arguments accept domain name (`example.com`) or zone ID (32-char hex). Zone IDs are cached in `/tmp` for 1 hour.

### DNS

```bash
cf-api dns list example.com
cf-api dns list example.com --type A
cf-api dns list example.com --name sub.example.com
cf-api dns get example.com RECORD_ID
cf-api dns add example.com A sub 1.2.3.4
cf-api dns add example.com A sub 1.2.3.4 --proxy
cf-api dns add example.com MX example.com mail.example.com --priority 10
cf-api dns add example.com TXT example.com "v=spf1 include:_spf.google.com ~all"
cf-api dns edit example.com RECORD_ID --content 5.6.7.8
cf-api dns del example.com RECORD_ID
cf-api dns export example.com         # BIND zone file
cf-api dns import example.com zone.txt
```

### Tail (live logs)

Stream real-time logs from a Worker. Shows console.log output, HTTP requests, errors, and exceptions.

```bash
cf-api tail ACCOUNT_ID my-worker
cf-api tail ACCOUNT_ID my-worker --format json
cf-api tail ACCOUNT_ID my-worker --status error
cf-api tail ACCOUNT_ID my-worker --search "user"
cf-api tail ACCOUNT_ID my-worker --method GET --method POST
cf-api tail ACCOUNT_ID my-worker --ip self
```

### Secrets

```bash
cf-api secret list ACCOUNT_ID my-worker
cf-api secret set ACCOUNT_ID my-worker SECRET_NAME "secret-value"
cf-api secret del ACCOUNT_ID my-worker SECRET_NAME
```

### Deployments & Rollback

```bash
cf-api deployments list ACCOUNT_ID my-worker        # recent deployments
cf-api deployments versions ACCOUNT_ID my-worker     # all versions
cf-api deployments get ACCOUNT_ID my-worker VER_ID   # version detail
cf-api deployments rollback ACCOUNT_ID my-worker VER_ID
cf-api deployments rollback ACCOUNT_ID my-worker VER_ID -m "reason"
```

### Workers

```bash
cf-api workers list ACCOUNT_ID
cf-api workers get ACCOUNT_ID my-worker      # download source
cf-api workers del ACCOUNT_ID my-worker
cf-api workers routes example.com            # routes for a zone
cf-api workers subdomain ACCOUNT_ID
```

### D1 (SQL databases)

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

### KV

```bash
cf-api kv ns ACCOUNT_ID                          # list namespaces
cf-api kv keys ACCOUNT_ID NAMESPACE_ID            # list keys
cf-api kv keys ACCOUNT_ID NAMESPACE_ID --prefix user:
cf-api kv get ACCOUNT_ID NAMESPACE_ID mykey
cf-api kv set ACCOUNT_ID NAMESPACE_ID mykey "value"
cf-api kv del ACCOUNT_ID NAMESPACE_ID mykey
```

### R2

```bash
cf-api r2 list ACCOUNT_ID
cf-api r2 create ACCOUNT_ID my-bucket
cf-api r2 del ACCOUNT_ID my-bucket
```

### Cache

```bash
cf-api purge example.com                    # purge everything
cf-api purge example.com https://example.com/style.css https://example.com/app.js
```

### SSL

```bash
cf-api ssl list example.com        # certificate packs
cf-api ssl status example.com      # verification status
cf-api ssl setting example.com     # current SSL mode
cf-api ssl set example.com strict  # off | flexible | full | strict
```

### Firewall

```bash
cf-api firewall rules example.com
cf-api firewall waf example.com
cf-api firewall access-rules example.com
```

### Pages

```bash
cf-api pages list ACCOUNT_ID
cf-api pages get ACCOUNT_ID my-site
cf-api pages deployments ACCOUNT_ID my-site
```

### Tunnels

```bash
cf-api tunnels list ACCOUNT_ID
cf-api tunnels get ACCOUNT_ID TUNNEL_ID
cf-api tunnels del ACCOUNT_ID TUNNEL_ID
cf-api tunnels config ACCOUNT_ID TUNNEL_ID
```

### Account & User

```bash
cf-api accounts    # list accounts
cf-api user        # current user info
cf-api ips         # Cloudflare IP ranges
```

## Output

Default output is aligned tables (for arrays) or key-value pairs (for objects). Add `-j` to any command for raw JSON:

```bash
cf-api zones list              # table
cf-api zones list -j           # raw JSON
cf-api dns list example.com -j # raw JSON
```

## Design

- **Single tool** - one CLI for everything, replaces wrangler + flarectl + curl
- **No REST jargon** - human verbs (get, create, edit, delete) not HTTP methods
- **Raw power** - `cf-api raw` gives access to any CF API endpoint
- **Table output** - readable tables by default, `-j` for JSON
- **Minimal deps** - commander (CLI framework) + smol-toml (TOML parsing)
- **ESM** - `"type": "module"`, works on Node 18+ and Bun
- **Smart auth** - loads `.env` from cwd and `~/.env`, worker commands prefer Global API Key
- **Zone caching** - zone name-to-ID lookups cached in `/tmp` for 1 hour

## License

MIT
