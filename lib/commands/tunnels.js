import { api, out, die } from '../api.js'

export function register(program) {
  const cmd = program
    .command('tunnels')
    .alias('tunnel')
    .description(`Cloudflare Tunnel management.
  Examples:
    cf-api tunnels list ACCOUNT_ID
    cf-api tunnels get ACCOUNT_ID TUNNEL_ID
    cf-api tunnels del ACCOUNT_ID TUNNEL_ID
    cf-api tunnels config ACCOUNT_ID TUNNEL_ID`)

  cmd
    .command('list')
    .alias('ls')
    .description('List Cloudflare Tunnels.')
    .argument('<account_id>', 'Cloudflare account ID')
    .action(async (acct) => {
      try {
        const resp = await api('GET', `accounts/${acct}/cfd_tunnel`)
        out((resp.result || []).map(t => ({
          id: t.id, name: t.name, status: t.status, created_at: t.created_at,
          connections: (t.connections || []).map(c => ({
            colo_name: c.colo_name, is_pending_reconnect: c.is_pending_reconnect
          }))
        })))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('get')
    .alias('info')
    .description('Get tunnel details.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<tunnel_id>', 'tunnel ID')
    .action(async (acct, tid) => {
      try {
        const resp = await api('GET', `accounts/${acct}/cfd_tunnel/${tid}`)
        out(resp.result)
      } catch (e) { die(e.message) }
    })

  cmd
    .command('del')
    .aliases(['delete', 'rm'])
    .description('Delete a tunnel.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<tunnel_id>', 'tunnel ID')
    .action(async (acct, tid) => {
      try {
        const resp = await api('DELETE', `accounts/${acct}/cfd_tunnel/${tid}`)
        out({ success: resp.success })
      } catch (e) { die(e.message) }
    })

  cmd
    .command('config')
    .alias('dns')
    .description('Get tunnel configuration/routes.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<tunnel_id>', 'tunnel ID')
    .action(async (acct, tid) => {
      try {
        const resp = await api('GET', `accounts/${acct}/cfd_tunnel/${tid}/configurations`)
        out(resp.result)
      } catch (e) { die(e.message) }
    })
}
