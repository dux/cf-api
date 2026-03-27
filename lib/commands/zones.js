import { api, zoneId, out, die } from '../api.js'

export function register(program) {
  const cmd = program
    .command('zones')
    .aliases(['zone', 'domains', 'domain'])
    .description(`Zone / domain management.
  Examples:
    cf-api zones list                  - list all zones
    cf-api zones list example.com      - filter by name
    cf-api zones get example.com       - zone details
    cf-api zones settings example.com  - all zone settings
    cf-api domains list                - same as cf-api zones list`)

  cmd
    .command('list', { isDefault: true })
    .alias('ls')
    .description('List zones. Optionally filter by name.')
    .argument('[name]', 'filter by zone name')
    .action(async (name) => {
      try {
        let path = 'zones?per_page=50'
        if (name) path = `zones?name=${name}&per_page=50`
        const resp = await api('GET', path)
        out((resp.result || []).map(z => ({
          id: z.id, name: z.name, status: z.status, plan: z.plan?.name
        })))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('get')
    .alias('info')
    .description('Get zone details.')
    .argument('<zone>', 'zone name or ID')
    .action(async (zone) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}`)
        const z = resp.result
        out({ id: z.id, name: z.name, status: z.status, name_servers: z.name_servers, plan: z.plan?.name, created_on: z.created_on })
      } catch (e) { die(e.message) }
    })

  cmd
    .command('settings')
    .description('Get all zone settings.')
    .argument('<zone>', 'zone name or ID')
    .action(async (zone) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/settings`)
        out(resp.result)
      } catch (e) { die(e.message) }
    })
}
