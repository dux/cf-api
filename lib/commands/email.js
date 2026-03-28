import { api, zoneId, out, die } from '../api.js'

export function register(program) {
  const cmd = program
    .command('email')
    .alias('mail')
    .description(`Email Routing - forward emails to other addresses or workers.
  Route incoming mail by address or catch-all rule. No mail server needed.
  Examples:
    cf-api email settings example.com
    cf-api email rules list example.com
    cf-api email rules get example.com RULE_ID
    cf-api email rules create example.com info@example.com dest@gmail.com
    cf-api email rules del example.com RULE_ID
    cf-api email catch-all example.com
    cf-api email catch-all-set example.com dest@gmail.com
    cf-api email addresses list example.com
    cf-api email addresses add example.com dest@gmail.com`)

  cmd
    .command('settings')
    .alias('status')
    .description('Get email routing settings for a zone.')
    .argument('<zone>', 'zone name or ID')
    .action(async (zone) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/email/routing`)
        out(resp.result || resp)
      } catch (e) { die(e.message) }
    })

  // --- routing rules ---
  const rules = cmd
    .command('rules')
    .description('Email routing rules.')

  rules
    .command('list')
    .alias('ls')
    .description('List email routing rules.')
    .argument('<zone>', 'zone name or ID')
    .action(async (zone) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/email/routing/rules?per_page=50`)
        out((resp.result || []).map(r => ({
          id: r.tag || r.id,
          name: r.name || '-',
          enabled: r.enabled,
          matchers: r.matchers?.map(m => `${m.field}:${m.value}`).join(', ') || '-',
          actions: r.actions?.map(a => `${a.type}:${a.value?.join(',') || ''}`).join('; ') || '-',
          priority: r.priority || 0,
        })))
      } catch (e) { die(e.message) }
    })

  rules
    .command('get')
    .description('Get email routing rule details.')
    .argument('<zone>', 'zone name or ID')
    .argument('<rule_id>', 'rule ID/tag')
    .action(async (zone, ruleId) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/email/routing/rules/${ruleId}`)
        out(resp.result)
      } catch (e) { die(e.message) }
    })

  rules
    .command('create')
    .alias('add')
    .description('Create an email routing rule (forward from -> to).')
    .argument('<zone>', 'zone name or ID')
    .argument('<from>', 'source email address (e.g. info@example.com)')
    .argument('<to>', 'destination email address')
    .option('--name <name>', 'rule name')
    .action(async (zone, from, to, opts) => {
      try {
        const zid = await zoneId(zone)
        const body = {
          matchers: [{ type: 'literal', field: 'to', value: from }],
          actions: [{ type: 'forward', value: [to] }],
          enabled: true,
        }
        if (opts.name) body.name = opts.name
        const resp = await api('POST', `zones/${zid}/email/routing/rules`, body)
        if (resp.success) {
          out({ success: true, id: resp.result?.tag || resp.result?.id })
        } else {
          out(resp)
        }
      } catch (e) { die(e.message) }
    })

  rules
    .command('del')
    .aliases(['delete', 'rm'])
    .description('Delete an email routing rule.')
    .argument('<zone>', 'zone name or ID')
    .argument('<rule_id>', 'rule ID/tag')
    .action(async (zone, ruleId) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('DELETE', `zones/${zid}/email/routing/rules/${ruleId}`)
        out({ success: resp.success })
      } catch (e) { die(e.message) }
    })

  // --- catch-all ---
  cmd
    .command('catch-all')
    .alias('catchall')
    .description('Get catch-all rule (handles unmatched addresses).')
    .argument('<zone>', 'zone name or ID')
    .action(async (zone) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/email/routing/rules/catch_all`)
        out(resp.result || resp)
      } catch (e) { die(e.message) }
    })

  cmd
    .command('catch-all-set')
    .alias('catchall-set')
    .description('Set catch-all rule to forward to an address.')
    .argument('<zone>', 'zone name or ID')
    .argument('<to>', 'destination email address (or "drop" to discard)')
    .action(async (zone, to) => {
      try {
        const zid = await zoneId(zone)
        const body = {
          matchers: [{ type: 'all' }],
          actions: to === 'drop'
            ? [{ type: 'drop' }]
            : [{ type: 'forward', value: [to] }],
          enabled: true,
        }
        const resp = await api('PUT', `zones/${zid}/email/routing/rules/catch_all`, body)
        if (resp.success) {
          out({ success: true, action: to === 'drop' ? 'drop' : `forward to ${to}` })
        } else {
          out(resp)
        }
      } catch (e) { die(e.message) }
    })

  // --- destination addresses ---
  const addrs = cmd
    .command('addresses')
    .alias('dest')
    .description('Destination email addresses (must be verified before use).')

  addrs
    .command('list')
    .alias('ls')
    .description('List verified destination addresses.')
    .argument('<zone>', 'zone name or ID')
    .action(async (zone) => {
      try {
        // destination addresses are account-level, but zone context helps
        // actually the API uses account_id, but we can try zone-level first
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/email/routing/addresses?per_page=50`)
        // fallback: may be at account level
        if (resp.result) {
          out((resp.result || []).map(a => ({
            id: a.id || a.tag, email: a.email,
            verified: a.verified, created: a.created,
          })))
        } else {
          out(resp)
        }
      } catch (e) { die(e.message) }
    })

  addrs
    .command('add')
    .alias('create')
    .description('Add a destination address (sends verification email).')
    .argument('<zone>', 'zone name or ID')
    .argument('<email>', 'destination email to add')
    .action(async (zone, email) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('POST', `zones/${zid}/email/routing/addresses`, { email })
        if (resp.success) {
          out({ success: true, email, status: 'verification email sent' })
        } else {
          out(resp)
        }
      } catch (e) { die(e.message) }
    })
}
