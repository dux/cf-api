import { api, zoneId, out, die } from '../api.js'

export function register(program) {
  const cmd = program
    .command('analytics')
    .alias('stats')
    .description(`Analytics - traffic stats for zones and workers.
  View request counts, bandwidth, threats, status codes and more.
  Examples:
    cf-api analytics zone example.com
    cf-api analytics zone example.com --since -1440   last 24h (minutes)
    cf-api analytics zone example.com --since -10080  last 7 days
    cf-api analytics dns example.com
    cf-api analytics worker <acct> <worker>`)

  cmd
    .command('zone')
    .alias('site')
    .description('Zone analytics dashboard - requests, bandwidth, threats, pageviews.')
    .argument('<zone>', 'zone name or ID')
    .option('--since <minutes>', 'minutes from now (negative), default -1440 (24h)', '-1440')
    .action(async (zone, opts) => {
      try {
        const zid = await zoneId(zone)
        const since = parseInt(opts.since)
        const resp = await api('GET', `zones/${zid}/analytics/dashboard?since=${since}&continuous=true`)
        if (!resp.success) { out(resp); return }
        const t = resp.result?.totals
        if (!t) { out(resp.result || {}); return }
        out({
          requests_all: t.requests?.all || 0,
          requests_cached: t.requests?.cached || 0,
          requests_uncached: t.requests?.uncached || 0,
          bandwidth_all: fmtBytes(t.bandwidth?.all),
          bandwidth_cached: fmtBytes(t.bandwidth?.cached),
          bandwidth_uncached: fmtBytes(t.bandwidth?.uncached),
          threats_all: t.threats?.all || 0,
          pageviews_all: t.pageviews?.all || 0,
          uniques_all: t.uniques?.all || 0,
          ssl_encrypted: t.requests?.ssl?.encrypted || 0,
          ssl_unencrypted: t.requests?.ssl?.unencrypted || 0,
          status_2xx: sumRange(t.requests?.http_status, 200, 299),
          status_3xx: sumRange(t.requests?.http_status, 300, 399),
          status_4xx: sumRange(t.requests?.http_status, 400, 499),
          status_5xx: sumRange(t.requests?.http_status, 500, 599),
          countries: Object.keys(t.requests?.country || {}).length,
        })
      } catch (e) { die(e.message) }
    })

  cmd
    .command('dns')
    .description('DNS analytics - query counts by type, response code, origin.')
    .argument('<zone>', 'zone name or ID')
    .option('--since <minutes>', 'minutes from now (negative), default -1440 (24h)', '-1440')
    .action(async (zone, opts) => {
      try {
        const zid = await zoneId(zone)
        const now = new Date()
        const since = new Date(now.getTime() + parseInt(opts.since) * 60000)
        const dimensions = 'queryType'
        const resp = await api('GET',
          `zones/${zid}/dns_analytics/report?dimensions=${dimensions}` +
          `&since=${since.toISOString()}&until=${now.toISOString()}&metrics=queryCount`)
        if (!resp.success) { out(resp); return }
        const rows = resp.result?.data || resp.result?.rows || []
        if (rows.length === 0) {
          out({ info: 'no DNS analytics data for this period' })
          return
        }
        out(rows.map(r => ({
          query_type: r.dimensions?.[0] || r.queryType || '-',
          count: r.metrics?.[0] || r.queryCount || 0,
        })))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('worker')
    .alias('workers')
    .description('Worker analytics - requests, errors, CPU time.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<worker>', 'worker script name')
    .option('--since <minutes>', 'minutes from now (negative), default -1440 (24h)', '-1440')
    .action(async (acct, worker, opts) => {
      try {
        // Workers analytics uses GraphQL API
        const now = new Date()
        const since = new Date(now.getTime() + parseInt(opts.since) * 60000)
        const query = `query {
          viewer {
            accounts(filter: {accountTag: "${acct}"}) {
              workersInvocationsAdaptive(
                filter: {
                  scriptName: "${worker}",
                  datetime_geq: "${since.toISOString()}",
                  datetime_leq: "${now.toISOString()}"
                }
                limit: 1000
                orderBy: [datetime_ASC]
              ) {
                sum {
                  requests
                  subrequests
                  errors
                  wallTime
                }
                dimensions {
                  datetime
                  status
                }
              }
            }
          }
        }`
        const resp = await api('POST', 'graphql', { query })
        const data = resp.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive
        if (!data || data.length === 0) {
          out({ info: 'no worker analytics data for this period' })
          return
        }
        // aggregate totals
        let totalReqs = 0, totalErrors = 0, totalSubreqs = 0, totalWall = 0
        for (const d of data) {
          totalReqs += d.sum?.requests || 0
          totalErrors += d.sum?.errors || 0
          totalSubreqs += d.sum?.subrequests || 0
          totalWall += d.sum?.wallTime || 0
        }
        out({
          worker,
          period: `${since.toISOString()} to ${now.toISOString()}`,
          requests: totalReqs,
          errors: totalErrors,
          subrequests: totalSubreqs,
          avg_wall_time_ms: data.length > 0 ? Math.round(totalWall / data.length) : 0,
          data_points: data.length,
        })
      } catch (e) { die(e.message) }
    })
}

function fmtBytes(n) {
  if (!n || n === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(n) / Math.log(1024))
  return (n / Math.pow(1024, i)).toFixed(1) + ' ' + units[i]
}

function sumRange(obj, lo, hi) {
  if (!obj) return 0
  let sum = 0
  for (const [k, v] of Object.entries(obj)) {
    const code = parseInt(k)
    if (code >= lo && code <= hi) sum += v
  }
  return sum
}
