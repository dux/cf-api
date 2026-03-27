import { api, out, die } from '../api.js'

export function register(program) {
  program
    .command('accounts')
    .alias('acct')
    .description(`List Cloudflare accounts.
  Example: cf-api accounts`)
    .action(async () => {
      try {
        const resp = await api('GET', 'accounts?per_page=50')
        out((resp.result || []).map(a => ({ id: a.id, name: a.name, type: a.type })))
      } catch (e) { die(e.message) }
    })
}
