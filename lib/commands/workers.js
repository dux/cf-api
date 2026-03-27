import { keyApi as api, zoneId, out, die } from '../api.js'

export function register(program) {
  const cmd = program
    .command('workers')
    .alias('worker')
    .description(`Workers script management.
  Examples:
    cf-api workers list ACCOUNT_ID
    cf-api workers get ACCOUNT_ID my-worker
    cf-api workers del ACCOUNT_ID my-worker
    cf-api workers routes example.com
    cf-api workers subdomain ACCOUNT_ID`)

  cmd
    .command('list')
    .alias('ls')
    .description('List worker scripts.')
    .argument('<account_id>', 'Cloudflare account ID')
    .action(async (acct) => {
      try {
        const resp = await api('GET', `accounts/${acct}/workers/scripts`)
        out((resp.result || []).map(w => ({
          id: w.id, created_on: w.created_on, modified_on: w.modified_on
        })))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('get')
    .alias('info')
    .description('Download worker script source.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<name>', 'worker script name')
    .action(async (acct, name) => {
      try {
        const resp = await api('GET', `accounts/${acct}/workers/scripts/${name}`)
        out(resp)
      } catch (e) { die(e.message) }
    })

  cmd
    .command('del')
    .aliases(['delete', 'rm'])
    .description('Delete a worker script.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<name>', 'worker script name')
    .action(async (acct, name) => {
      try {
        const resp = await api('DELETE', `accounts/${acct}/workers/scripts/${name}`)
        out({ success: resp.success })
      } catch (e) { die(e.message) }
    })

  cmd
    .command('routes')
    .description('List worker routes for a zone.')
    .argument('<zone>', 'zone name or ID')
    .action(async (zone) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/workers/routes`)
        out((resp.result || []).map(r => ({
          id: r.id, pattern: r.pattern, script: r.script
        })))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('subdomain')
    .description('Get workers subdomain for account.')
    .argument('<account_id>', 'Cloudflare account ID')
    .action(async (acct) => {
      try {
        const resp = await api('GET', `accounts/${acct}/workers/subdomain`)
        out(resp.result)
      } catch (e) { die(e.message) }
    })
}
