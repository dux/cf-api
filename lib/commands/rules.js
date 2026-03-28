import { api, zoneId, out, die } from '../api.js'

export function register(program) {
  const cmd = program
    .command('rules')
    .alias('rule')
    .description(`Rules - page rules, redirect rules, and rulesets.
  Page rules: legacy URL-based actions (forwarding, caching, SSL).
  Rulesets: modern rule engine for redirects, transforms, rate limiting.
  Examples:
    cf-api rules page list example.com
    cf-api rules page get example.com RULE_ID
    cf-api rules page create example.com "*.example.com/*" forwarding_url=301:https://new.com/$2
    cf-api rules page del example.com RULE_ID
    cf-api rules rulesets example.com
    cf-api rules ruleset example.com RULESET_ID
    cf-api rules redirects example.com
    cf-api rules redirect-add example.com /old /new 301`)

  // --- page rules ---
  cmd
    .command('page')
    .alias('pages')
    .description('Page rules management (legacy URL-based rules).')
    .argument('<action>', 'list | get | create | del')
    .argument('<zone>', 'zone name or ID')
    .argument('[args...]', 'additional arguments')
    .action(async (action, zone, args) => {
      try {
        const zid = await zoneId(zone)
        switch (action) {
          case 'list':
          case 'ls': {
            const resp = await api('GET', `zones/${zid}/pagerules?status=active&per_page=50`)
            out((resp.result || []).map(r => ({
              id: r.id,
              status: r.status,
              priority: r.priority,
              target: r.targets?.[0]?.constraint?.value || '-',
              actions: r.actions?.map(a => `${a.id}=${JSON.stringify(a.value)}`).join('; ') || '-',
            })))
            break
          }
          case 'get': {
            if (!args[0]) die('usage: cf-api rules page get <zone> <rule_id>')
            const resp = await api('GET', `zones/${zid}/pagerules/${args[0]}`)
            out(resp.result)
            break
          }
          case 'create':
          case 'add': {
            // args: [url_pattern, action=value, ...]
            if (args.length < 2) die('usage: cf-api rules page create <zone> <url_pattern> <action=value> ...')
            const pattern = args[0]
            const actions = args.slice(1).map(a => {
              const [id, val] = a.split('=')
              // forwarding_url special: 301:https://... or 302:https://...
              if (id === 'forwarding_url') {
                const colon = val.indexOf(':')
                return {
                  id: 'forwarding_url',
                  value: {
                    status_code: parseInt(val.slice(0, colon)),
                    url: val.slice(colon + 1),
                  },
                }
              }
              // try to parse value as JSON, else keep string
              let parsed = val
              try { parsed = JSON.parse(val) } catch {}
              return { id, value: parsed }
            })
            const body = {
              targets: [{ target: 'url', constraint: { operator: 'matches', value: pattern } }],
              actions,
              status: 'active',
            }
            const resp = await api('POST', `zones/${zid}/pagerules`, body)
            if (resp.success) {
              out({ success: true, id: resp.result.id, target: pattern })
            } else {
              out(resp)
            }
            break
          }
          case 'del':
          case 'delete':
          case 'rm': {
            if (!args[0]) die('usage: cf-api rules page del <zone> <rule_id>')
            const resp = await api('DELETE', `zones/${zid}/pagerules/${args[0]}`)
            out({ success: resp.success })
            break
          }
          default:
            die(`unknown page rule action: ${action}. Use list|get|create|del`)
        }
      } catch (e) { die(e.message) }
    })

  // --- rulesets ---
  cmd
    .command('rulesets')
    .alias('rs')
    .description('List zone rulesets (modern rule engine).')
    .argument('<zone>', 'zone name or ID')
    .action(async (zone) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/rulesets`)
        out((resp.result || []).map(r => ({
          id: r.id, name: r.name || '-', kind: r.kind, phase: r.phase,
          version: r.version, rules: r.rules?.length || 0,
        })))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('ruleset')
    .description('Get a specific ruleset with all rules.')
    .argument('<zone>', 'zone name or ID')
    .argument('<ruleset_id>', 'ruleset ID')
    .action(async (zone, rulesetId) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/rulesets/${rulesetId}`)
        out(resp.result)
      } catch (e) { die(e.message) }
    })

  // --- redirect rules (shortcut for redirect phase ruleset) ---
  cmd
    .command('redirects')
    .description('List redirect rules (from http_request_dynamic_redirect phase).')
    .argument('<zone>', 'zone name or ID')
    .action(async (zone) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/rulesets/phases/http_request_dynamic_redirect/entrypoint`)
        const rules = resp.result?.rules || []
        if (rules.length === 0) { out([]); return }
        out(rules.map(r => ({
          id: r.id,
          expression: r.expression || '-',
          status_code: r.action_parameters?.from_value?.status_code || '-',
          target_url: r.action_parameters?.from_value?.target_url?.value ||
                      r.action_parameters?.from_value?.target_url?.expression || '-',
          enabled: r.enabled !== false,
        })))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('redirect-add')
    .description('Add a redirect rule.')
    .argument('<zone>', 'zone name or ID')
    .argument('<from>', 'source path expression or URL pattern')
    .argument('<to>', 'target URL')
    .argument('[status]', 'status code: 301 or 302 (default 301)', '301')
    .action(async (zone, from, to, status) => {
      try {
        const zid = await zoneId(zone)
        const code = parseInt(status)

        // build expression: if "from" looks like a path, wrap in expression
        const expression = from.startsWith('(')
          ? from
          : `(http.request.uri.path eq "${from}")`

        // fetch existing ruleset to append
        let existing = []
        try {
          const cur = await api('GET', `zones/${zid}/rulesets/phases/http_request_dynamic_redirect/entrypoint`)
          existing = cur.result?.rules || []
        } catch {}

        const newRule = {
          expression,
          action: 'redirect',
          action_parameters: {
            from_value: {
              status_code: code,
              target_url: { value: to },
            },
          },
          enabled: true,
        }

        // PUT replaces the whole ruleset
        const body = {
          rules: [...existing.map(r => ({
            id: r.id,
            expression: r.expression,
            action: r.action,
            action_parameters: r.action_parameters,
            enabled: r.enabled,
            description: r.description,
          })), newRule],
        }

        const resp = await api('PUT', `zones/${zid}/rulesets/phases/http_request_dynamic_redirect/entrypoint`, body)
        if (resp.success) {
          out({ success: true, rules_count: resp.result?.rules?.length || 0, added: from + ' -> ' + to })
        } else {
          out(resp)
        }
      } catch (e) { die(e.message) }
    })
}
