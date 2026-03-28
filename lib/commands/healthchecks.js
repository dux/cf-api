import { api, zoneId, out, die } from '../api.js'

export function register(program) {
  const cmd = program
    .command('healthchecks')
    .alias('health')
    .description(`Healthchecks - monitor origin server health.
  Periodic checks from CF edge to your origin. Get notified on failures.
  Supports HTTP, HTTPS, and TCP checks.
  Examples:
    cf-api healthchecks list example.com
    cf-api healthchecks get example.com CHECK_ID
    cf-api healthchecks create example.com --name "API check" --address api.example.com
    cf-api healthchecks create example.com --name "TCP DB" --address db.example.com --port 5432 --type TCP
    cf-api healthchecks edit example.com CHECK_ID --interval 120
    cf-api healthchecks del example.com CHECK_ID
    cf-api healthchecks preview example.com CHECK_ID`)

  cmd
    .command('list')
    .alias('ls')
    .description('List health checks for a zone.')
    .argument('<zone>', 'zone name or ID')
    .action(async (zone) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/healthchecks`)
        out((resp.result || []).map(h => ({
          id: h.id, name: h.name || '-',
          address: h.address, type: h.type || 'HTTPS',
          status: h.status || '-', failure_reason: h.failure_reason || '-',
          interval: h.interval, retries: h.retries,
          suspended: h.suspended || false,
        })))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('get')
    .alias('info')
    .description('Get health check details.')
    .argument('<zone>', 'zone name or ID')
    .argument('<check_id>', 'healthcheck ID')
    .action(async (zone, checkId) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/healthchecks/${checkId}`)
        out(resp.result)
      } catch (e) { die(e.message) }
    })

  cmd
    .command('create')
    .alias('add')
    .description('Create a health check.')
    .argument('<zone>', 'zone name or ID')
    .option('--name <name>', 'check name (required)')
    .option('--address <address>', 'address to check (required, hostname or IP)')
    .option('--type <type>', 'check type: HTTP, HTTPS, or TCP (default HTTPS)', 'HTTPS')
    .option('--port <n>', 'port number (default based on type)')
    .option('--path <path>', 'HTTP path to check (default /)', '/')
    .option('--interval <seconds>', 'check interval in seconds (default 60)', '60')
    .option('--retries <n>', 'number of retries before marking down (default 2)', '2')
    .option('--timeout <seconds>', 'timeout per check in seconds (default 5)', '5')
    .option('--method <method>', 'HTTP method (default GET)', 'GET')
    .option('--expected-codes <codes>', 'expected HTTP status codes (default 200)', '200')
    .option('--follow-redirects', 'follow redirects')
    .option('--allow-insecure', 'allow insecure HTTPS')
    .action(async (zone, opts) => {
      try {
        if (!opts.name) die('--name is required')
        if (!opts.address) die('--address is required')
        const zid = await zoneId(zone)
        const body = {
          name: opts.name,
          address: opts.address,
          type: opts.type.toUpperCase(),
          interval: parseInt(opts.interval),
          retries: parseInt(opts.retries),
          timeout: parseInt(opts.timeout),
          suspended: false,
        }

        if (opts.type.toUpperCase() !== 'TCP') {
          body.http_config = {
            method: opts.method,
            path: opts.path,
            expected_codes: opts.expectedCodes.split(',').map(c => c.trim()),
            follow_redirects: !!opts.followRedirects,
            allow_insecure: !!opts.allowInsecure,
          }
        }

        if (opts.port) body.port = parseInt(opts.port)

        const resp = await api('POST', `zones/${zid}/healthchecks`, body)
        if (resp.success) {
          out({ success: true, id: resp.result.id, name: resp.result.name, address: resp.result.address })
        } else {
          out(resp)
        }
      } catch (e) { die(e.message) }
    })

  cmd
    .command('edit')
    .alias('update')
    .description('Update a health check.')
    .argument('<zone>', 'zone name or ID')
    .argument('<check_id>', 'healthcheck ID')
    .option('--name <name>', 'new name')
    .option('--address <address>', 'new address')
    .option('--interval <seconds>', 'new interval')
    .option('--retries <n>', 'new retries')
    .option('--timeout <seconds>', 'new timeout')
    .option('--suspended <bool>', 'suspend check (true/false)')
    .action(async (zone, checkId, opts) => {
      try {
        const zid = await zoneId(zone)
        // fetch current to merge
        const cur = (await api('GET', `zones/${zid}/healthchecks/${checkId}`)).result
        if (!cur) die('healthcheck not found')
        const body = { ...cur }
        delete body.id
        delete body.created_on
        delete body.modified_on
        delete body.status
        delete body.failure_reason
        if (opts.name) body.name = opts.name
        if (opts.address) body.address = opts.address
        if (opts.interval) body.interval = parseInt(opts.interval)
        if (opts.retries) body.retries = parseInt(opts.retries)
        if (opts.timeout) body.timeout = parseInt(opts.timeout)
        if (opts.suspended !== undefined) body.suspended = opts.suspended === 'true'

        const resp = await api('PUT', `zones/${zid}/healthchecks/${checkId}`, body)
        if (resp.success) {
          out({ success: true, id: resp.result.id, name: resp.result.name })
        } else {
          out(resp)
        }
      } catch (e) { die(e.message) }
    })

  cmd
    .command('del')
    .aliases(['delete', 'rm'])
    .description('Delete a health check.')
    .argument('<zone>', 'zone name or ID')
    .argument('<check_id>', 'healthcheck ID')
    .action(async (zone, checkId) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('DELETE', `zones/${zid}/healthchecks/${checkId}`)
        out({ success: resp.success })
      } catch (e) { die(e.message) }
    })

  cmd
    .command('preview')
    .description('Preview a health check result (run a one-time check).')
    .argument('<zone>', 'zone name or ID')
    .argument('<check_id>', 'healthcheck ID')
    .action(async (zone, checkId) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('POST', `zones/${zid}/healthchecks/${checkId}/preview`)
        out(resp.result || resp)
      } catch (e) { die(e.message) }
    })
}
