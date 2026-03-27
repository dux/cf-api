import { api, out, die } from '../api.js'

export function registerUser(program) {
  program
    .command('user')
    .alias('me')
    .description(`Current user info.
  Example: cf-api user`)
    .action(async () => {
      try {
        const resp = await api('GET', 'user')
        if (!resp.success) { out(resp); return }
        const u = resp.result
        out({
          id: u.id, email: u.email, username: u.username,
          first_name: u.first_name, last_name: u.last_name,
          organizations: (u.organizations || []).map(o => o.name)
        })
      } catch (e) { die(e.message) }
    })
}

export function registerIps(program) {
  program
    .command('ips')
    .description(`Cloudflare IP ranges.
  Example: cf-api ips`)
    .action(async () => {
      try {
        const resp = await api('GET', 'ips')
        out(resp.result)
      } catch (e) { die(e.message) }
    })
}
