import { api, zoneId, out, die } from '../api.js'

export function register(program) {
  const cmd = program
    .command('firewall')
    .alias('fw')
    .description(`Firewall and WAF management.
  Examples:
    cf-api firewall rules example.com        - list firewall rules
    cf-api firewall waf example.com          - list WAF packages
    cf-api firewall access-rules example.com - list IP access rules`)

  cmd
    .command('rules')
    .alias('list')
    .description('List firewall rules.')
    .argument('<zone>', 'zone name or ID')
    .action(async (zone) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/firewall/rules`)
        out((resp.result || []).map(r => ({
          id: r.id, description: r.description, action: r.action,
          filter: r.filter?.expression, paused: r.paused
        })))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('waf')
    .description('List WAF packages.')
    .argument('<zone>', 'zone name or ID')
    .action(async (zone) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/firewall/waf/packages`)
        out(resp.result)
      } catch (e) { die(e.message) }
    })

  cmd
    .command('access-rules')
    .description('List IP access rules.')
    .argument('<zone>', 'zone name or ID')
    .action(async (zone) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/firewall/access_rules/rules`)
        out((resp.result || []).map(r => ({
          id: r.id, mode: r.mode, configuration: r.configuration, notes: r.notes
        })))
      } catch (e) { die(e.message) }
    })
}
