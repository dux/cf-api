import { api, zoneId, out, die } from '../api.js'

export function register(program) {
  const cmd = program
    .command('dns')
    .description(`DNS record management.
  Examples:
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
    cf-api dns export example.com
    cf-api dns import example.com ./zone.txt`)

  cmd
    .command('list')
    .alias('ls')
    .description('List DNS records for a zone.')
    .argument('<zone>', 'zone name or ID')
    .option('-t, --type <type>', 'filter by record type (A, AAAA, CNAME, MX, TXT, ...)')
    .option('-n, --name <name>', 'filter by record name')
    .action(async (zone, opts) => {
      try {
        const zid = await zoneId(zone)
        let path = `zones/${zid}/dns_records?per_page=100`
        if (opts.type) path += `&type=${opts.type}`
        if (opts.name) path += `&name=${opts.name}`
        const resp = await api('GET', path)
        out((resp.result || []).map(r => ({
          id: r.id, type: r.type, name: r.name, content: r.content, ttl: r.ttl, proxied: r.proxied
        })))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('get')
    .description('Get a single DNS record.')
    .argument('<zone>', 'zone name or ID')
    .argument('<record_id>', 'DNS record ID')
    .action(async (zone, recordId) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/dns_records/${recordId}`)
        out(resp.result)
      } catch (e) { die(e.message) }
    })

  cmd
    .command('add')
    .alias('create')
    .description('Create a DNS record.')
    .argument('<zone>', 'zone name or ID')
    .argument('<type>', 'record type: A, AAAA, CNAME, MX, TXT, SRV, NS, CAA, ...')
    .argument('<name>', 'record name (e.g. sub or sub.example.com)')
    .argument('<content>', 'record content (IP, hostname, text, ...)')
    .option('--ttl <seconds>', 'TTL in seconds (1 = auto)', '1')
    .option('--proxy', 'enable Cloudflare proxy (orange cloud)')
    .option('--no-proxy', 'disable proxy (grey cloud)')
    .option('-p, --priority <n>', 'priority (for MX, SRV)')
    .action(async (zone, type, name, content, opts) => {
      try {
        const zid = await zoneId(zone)
        const data = {
          type: type.toUpperCase(),
          name,
          content,
          ttl: parseInt(opts.ttl),
          proxied: !!opts.proxy,
        }
        if (opts.priority) data.priority = parseInt(opts.priority)
        const resp = await api('POST', `zones/${zid}/dns_records`, data)
        if (!resp.success) { out(resp); return }
        const r = resp.result
        out({ success: true, result: { id: r.id, type: r.type, name: r.name, content: r.content, ttl: r.ttl, proxied: r.proxied } })
      } catch (e) { die(e.message) }
    })

  cmd
    .command('edit')
    .alias('update')
    .description('Update a DNS record. Fetches current values, merges your changes.')
    .argument('<zone>', 'zone name or ID')
    .argument('<record_id>', 'DNS record ID')
    .option('-t, --type <type>', 'new record type')
    .option('-n, --name <name>', 'new record name')
    .option('-c, --content <content>', 'new content')
    .option('--ttl <seconds>', 'new TTL')
    .option('--proxy', 'enable proxy')
    .option('--no-proxy', 'disable proxy')
    .action(async (zone, recordId, opts) => {
      try {
        const zid = await zoneId(zone)
        // fetch current
        const cur = (await api('GET', `zones/${zid}/dns_records/${recordId}`)).result
        const data = {
          type: opts.type || cur.type,
          name: opts.name || cur.name,
          content: opts.content || cur.content,
          ttl: opts.ttl ? parseInt(opts.ttl) : cur.ttl,
          proxied: opts.proxy !== undefined ? opts.proxy : cur.proxied,
        }
        const resp = await api('PUT', `zones/${zid}/dns_records/${recordId}`, data)
        if (!resp.success) { out(resp); return }
        const r = resp.result
        out({ success: true, result: { id: r.id, type: r.type, name: r.name, content: r.content, ttl: r.ttl, proxied: r.proxied } })
      } catch (e) { die(e.message) }
    })

  cmd
    .command('del')
    .aliases(['delete', 'rm'])
    .description('Delete a DNS record.')
    .argument('<zone>', 'zone name or ID')
    .argument('<record_id>', 'DNS record ID')
    .action(async (zone, recordId) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('DELETE', `zones/${zid}/dns_records/${recordId}`)
        out({ success: resp.success, result: resp.result })
      } catch (e) { die(e.message) }
    })

  cmd
    .command('export')
    .description('Export DNS records as BIND zone file.')
    .argument('<zone>', 'zone name or ID')
    .action(async (zone) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/dns_records/export`)
        // this returns plain text, not JSON
        out(resp)
      } catch (e) { die(e.message) }
    })

  cmd
    .command('import')
    .description('Import DNS records from BIND zone file.')
    .argument('<zone>', 'zone name or ID')
    .argument('<file>', 'path to BIND zone file')
    .action(async (zone, file) => {
      try {
        const { readFileSync } = await import('node:fs')
        const zid = await zoneId(zone)
        const body = readFileSync(file, 'utf8')

        // import needs multipart/form-data
        const token = process.env.CF_API_TOKEN
        const headers = {}
        if (token) {
          headers.Authorization = `Bearer ${token}`
        } else {
          headers['X-Auth-Key'] = process.env.CF_API_KEY
          headers['X-Auth-Email'] = process.env.CF_API_EMAIL
        }

        const form = new FormData()
        form.append('file', new Blob([body]), 'zone.txt')

        const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zid}/dns_records/import`, {
          method: 'POST',
          headers,
          body: form,
        })
        out(await res.json())
      } catch (e) { die(e.message) }
    })
}
