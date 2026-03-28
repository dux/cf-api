import { api, out, die } from '../api.js'

export function register(program) {
  const cmd = program
    .command('registrar')
    .alias('reg')
    .description(`Registrar - domain registration and management.
  View and manage domains registered through Cloudflare Registrar.
  At-cost pricing, no markup. WHOIS privacy included.
  Examples:
    cf-api registrar list <acct>
    cf-api registrar get <acct> example.com
    cf-api registrar check <acct> example.com
    cf-api registrar update <acct> example.com --auto-renew true
    cf-api registrar contacts <acct>`)

  cmd
    .command('list')
    .alias('ls')
    .description('List domains registered with Cloudflare Registrar.')
    .argument('<account_id>', 'Cloudflare account ID')
    .action(async (acct) => {
      try {
        const resp = await api('GET', `accounts/${acct}/registrar/domains?per_page=50`)
        out((resp.result || []).map(d => ({
          name: d.domain_name || d.name,
          status: d.status,
          auto_renew: d.auto_renew,
          expires_at: d.expires_at || d.expiry_date || '-',
          locked: d.locked,
          registrar: d.current_registrar || 'cloudflare',
        })))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('get')
    .alias('info')
    .description('Get domain registration details.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<domain>', 'domain name')
    .action(async (acct, domain) => {
      try {
        const resp = await api('GET', `accounts/${acct}/registrar/domains/${domain}`)
        out(resp.result)
      } catch (e) { die(e.message) }
    })

  cmd
    .command('check')
    .alias('avail')
    .description('Check domain availability for registration.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<domain>', 'domain name to check')
    .action(async (acct, domain) => {
      try {
        const resp = await api('POST', `accounts/${acct}/registrar/domains/check`, {
          names: [domain],
        })
        const results = resp.result || []
        if (results.length === 0) {
          out({ domain, available: 'unknown', info: 'no result returned' })
          return
        }
        out(results.map(r => ({
          domain: r.name || r.domain,
          available: r.available,
          premium: r.premium || false,
          price: r.price ? `${r.price.registration_fee} ${r.price.currency}` : '-',
        })))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('update')
    .alias('edit')
    .description('Update domain registration settings.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<domain>', 'domain name')
    .option('--auto-renew <bool>', 'enable/disable auto-renewal (true/false)')
    .option('--locked <bool>', 'enable/disable registrar lock (true/false)')
    .option('--privacy <bool>', 'enable/disable WHOIS privacy (true/false)')
    .action(async (acct, domain, opts) => {
      try {
        const body = {}
        if (opts.autoRenew !== undefined) body.auto_renew = opts.autoRenew === 'true'
        if (opts.locked !== undefined) body.locked = opts.locked === 'true'
        if (opts.privacy !== undefined) body.privacy = opts.privacy === 'true'
        if (Object.keys(body).length === 0) die('provide at least one option: --auto-renew, --locked, --privacy')
        const resp = await api('PUT', `accounts/${acct}/registrar/domains/${domain}`, body)
        if (resp.success) {
          out({ success: true, domain, ...body })
        } else {
          out(resp)
        }
      } catch (e) { die(e.message) }
    })

  cmd
    .command('contacts')
    .description('Get registrar contact information.')
    .argument('<account_id>', 'Cloudflare account ID')
    .action(async (acct) => {
      try {
        const resp = await api('GET', `accounts/${acct}/registrar/contacts`)
        out(resp.result || resp)
      } catch (e) { die(e.message) }
    })
}
