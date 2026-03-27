import { api, zoneId, out, die } from '../api.js'

export function register(program) {
  program
    .command('purge')
    .description(`Purge cache for a zone.
  No URLs = purge everything. With URLs = purge specific files.

  Examples:
    cf-api purge example.com
    cf-api purge example.com https://example.com/style.css https://example.com/app.js`)
    .argument('<zone>', 'zone name or ID')
    .argument('[urls...]', 'specific URLs to purge (omit to purge everything)')
    .action(async (zone, urls) => {
      try {
        const zid = await zoneId(zone)
        let body
        if (urls && urls.length > 0) {
          body = { files: urls }
        } else {
          body = { purge_everything: true }
        }
        const resp = await api('POST', `zones/${zid}/purge_cache`, body)
        out({ success: resp.success })
      } catch (e) { die(e.message) }
    })
}
