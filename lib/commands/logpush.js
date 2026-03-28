import { api, zoneId, out, die } from '../api.js'

export function register(program) {
  const cmd = program
    .command('logpush')
    .alias('logs-push')
    .description(`Logpush - push CF logs to storage (R2, S3, Datadog, Splunk, etc).
  Stream HTTP requests, firewall events, worker traces to external storage.
  Examples:
    cf-api logpush list example.com
    cf-api logpush get example.com JOB_ID
    cf-api logpush fields example.com http_requests
    cf-api logpush create example.com --dataset http_requests --dest r2://bucket/logs
    cf-api logpush edit example.com JOB_ID --enabled false
    cf-api logpush del example.com JOB_ID
    cf-api logpush datasets example.com`)

  cmd
    .command('list')
    .alias('ls')
    .description('List logpush jobs for a zone.')
    .argument('<zone>', 'zone name or ID')
    .action(async (zone) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/logpush/jobs`)
        out((resp.result || []).map(j => ({
          id: j.id, dataset: j.dataset,
          destination: j.destination_conf || '-',
          enabled: j.enabled, frequency: j.frequency || '-',
          last_complete: j.last_complete || '-', last_error: j.last_error || '-',
        })))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('get')
    .alias('info')
    .description('Get logpush job details.')
    .argument('<zone>', 'zone name or ID')
    .argument('<job_id>', 'logpush job ID')
    .action(async (zone, jobId) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/logpush/jobs/${jobId}`)
        out(resp.result)
      } catch (e) { die(e.message) }
    })

  cmd
    .command('fields')
    .description('List available fields for a dataset.')
    .argument('<zone>', 'zone name or ID')
    .argument('<dataset>', 'dataset: http_requests, firewall_events, workers_trace_events, ...')
    .action(async (zone, dataset) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/logpush/datasets/${dataset}/fields`)
        const fields = resp.result || resp
        if (typeof fields === 'object' && !Array.isArray(fields)) {
          out(Object.entries(fields).map(([name, desc]) => ({ field: name, description: desc })))
        } else {
          out(fields)
        }
      } catch (e) { die(e.message) }
    })

  cmd
    .command('datasets')
    .description('List available log datasets.')
    .argument('<zone>', 'zone name or ID')
    .action(async (zone) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/logpush/datasets`)
        out(resp.result || resp)
      } catch (e) { die(e.message) }
    })

  cmd
    .command('create')
    .alias('add')
    .description('Create a logpush job.')
    .argument('<zone>', 'zone name or ID')
    .option('-d, --dataset <dataset>', 'log dataset (http_requests, firewall_events, ...)', 'http_requests')
    .option('--dest <destination>', 'destination URI (r2://bucket/path, s3://..., https://...)')
    .option('--fields <fields>', 'comma-separated field names (default: all)')
    .option('--filter <filter>', 'log filter expression')
    .option('--freq <frequency>', 'push frequency: high or low', 'high')
    .option('--name <name>', 'job name')
    .action(async (zone, opts) => {
      try {
        if (!opts.dest) die('--dest is required (e.g. r2://bucket/logs/{DATE})')
        const zid = await zoneId(zone)
        const body = {
          dataset: opts.dataset,
          destination_conf: opts.dest,
          enabled: true,
          frequency: opts.freq,
        }
        if (opts.fields) body.logpull_options = `fields=${opts.fields}`
        if (opts.filter) body.filter = opts.filter
        if (opts.name) body.name = opts.name
        const resp = await api('POST', `zones/${zid}/logpush/jobs`, body)
        if (resp.success) {
          out({ success: true, id: resp.result.id, dataset: resp.result.dataset })
        } else {
          out(resp)
        }
      } catch (e) { die(e.message) }
    })

  cmd
    .command('edit')
    .alias('update')
    .description('Update a logpush job.')
    .argument('<zone>', 'zone name or ID')
    .argument('<job_id>', 'logpush job ID')
    .option('--enabled <bool>', 'enable or disable')
    .option('--dest <destination>', 'new destination URI')
    .option('--fields <fields>', 'new fields list')
    .option('--freq <frequency>', 'new frequency: high or low')
    .action(async (zone, jobId, opts) => {
      try {
        const zid = await zoneId(zone)
        const body = {}
        if (opts.enabled !== undefined) body.enabled = opts.enabled === 'true'
        if (opts.dest) body.destination_conf = opts.dest
        if (opts.fields) body.logpull_options = `fields=${opts.fields}`
        if (opts.freq) body.frequency = opts.freq
        const resp = await api('PUT', `zones/${zid}/logpush/jobs/${jobId}`, body)
        if (resp.success) {
          out({ success: true, id: resp.result.id, enabled: resp.result.enabled })
        } else {
          out(resp)
        }
      } catch (e) { die(e.message) }
    })

  cmd
    .command('del')
    .aliases(['delete', 'rm'])
    .description('Delete a logpush job.')
    .argument('<zone>', 'zone name or ID')
    .argument('<job_id>', 'logpush job ID')
    .action(async (zone, jobId) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('DELETE', `zones/${zid}/logpush/jobs/${jobId}`)
        out({ success: resp.success })
      } catch (e) { die(e.message) }
    })
}
