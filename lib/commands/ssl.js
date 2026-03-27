import { api, zoneId, out, die } from '../api.js'

export function register(program) {
  const cmd = program
    .command('ssl')
    .description(`SSL/TLS certificate management.
  Examples:
    cf-api ssl list example.com          - list certificate packs
    cf-api ssl status example.com        - verification status
    cf-api ssl setting example.com       - current SSL mode
    cf-api ssl set example.com strict    - set SSL mode`)

  cmd
    .command('list')
    .alias('ls')
    .description('List certificate packs.')
    .argument('<zone>', 'zone name or ID')
    .action(async (zone) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/ssl/certificate_packs?ssl_status=all`)
        out((resp.result || []).map(c => ({
          id: c.id, type: c.type, status: c.status, hosts: c.hosts,
          certificate_authority: c.certificate_authority, validity_days: c.validity_days
        })))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('status')
    .description('SSL verification status.')
    .argument('<zone>', 'zone name or ID')
    .action(async (zone) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/ssl/verification`)
        out(resp.result)
      } catch (e) { die(e.message) }
    })

  cmd
    .command('setting')
    .description('Get current SSL mode.')
    .argument('<zone>', 'zone name or ID')
    .action(async (zone) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/settings/ssl`)
        out(resp.result)
      } catch (e) { die(e.message) }
    })

  cmd
    .command('set')
    .description('Set SSL mode: off, flexible, full, strict')
    .argument('<zone>', 'zone name or ID')
    .argument('<mode>', 'SSL mode: off | flexible | full | strict')
    .action(async (zone, mode) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('PATCH', `zones/${zid}/settings/ssl`, { value: mode })
        out({ success: resp.success, result: resp.result })
      } catch (e) { die(e.message) }
    })
}
