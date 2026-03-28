import { api, out, die } from '../api.js'

export function register(program) {
  const cmd = program
    .command('queues')
    .alias('queue')
    .description(`Queues - message queues between workers.
  Durable, at-least-once delivery. Producers send messages, consumers process them.
  Examples:
    cf-api queues list <acct>
    cf-api queues get <acct> <queue>
    cf-api queues create <acct> <name>
    cf-api queues del <acct> <queue>
    cf-api queues consumers <acct> <queue>
    cf-api queues add-consumer <acct> <queue> <worker>
    cf-api queues del-consumer <acct> <queue> <consumer_id>
    cf-api queues send <acct> <queue> '{"event":"test"}'
    cf-api queues purge <acct> <queue>`)

  cmd
    .command('list')
    .alias('ls')
    .description('List all queues.')
    .argument('<account_id>', 'Cloudflare account ID')
    .action(async (acct) => {
      try {
        const resp = await api('GET', `accounts/${acct}/queues?per_page=100`)
        out((resp.result || []).map(q => ({
          id: q.queue_id, name: q.queue_name,
          producers: q.producers_total_count || 0,
          consumers: q.consumers_total_count || 0,
          created: q.created_on,
        })))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('get')
    .alias('info')
    .description('Get queue details.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<queue>', 'queue ID or name')
    .action(async (acct, queue) => {
      try {
        const qid = await resolveQueue(acct, queue)
        const resp = await api('GET', `accounts/${acct}/queues/${qid}`)
        out(resp.result)
      } catch (e) { die(e.message) }
    })

  cmd
    .command('create')
    .description('Create a queue.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<name>', 'queue name')
    .action(async (acct, name) => {
      try {
        const resp = await api('POST', `accounts/${acct}/queues`, { queue_name: name })
        if (resp.success) {
          out({ success: true, id: resp.result.queue_id, name: resp.result.queue_name })
        } else {
          out(resp)
        }
      } catch (e) { die(e.message) }
    })

  cmd
    .command('del')
    .aliases(['delete', 'rm'])
    .description('Delete a queue.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<queue>', 'queue ID or name')
    .action(async (acct, queue) => {
      try {
        const qid = await resolveQueue(acct, queue)
        const resp = await api('DELETE', `accounts/${acct}/queues/${qid}`)
        out({ success: resp.success })
      } catch (e) { die(e.message) }
    })

  cmd
    .command('consumers')
    .description('List consumers for a queue.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<queue>', 'queue ID or name')
    .action(async (acct, queue) => {
      try {
        const qid = await resolveQueue(acct, queue)
        const resp = await api('GET', `accounts/${acct}/queues/${qid}/consumers`)
        out((resp.result || []).map(c => ({
          id: c.consumer_id || c.queue_consumer_id,
          service: c.service || c.script_name || c.script,
          type: c.type || 'worker',
          created: c.created_on,
        })))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('add-consumer')
    .description('Add a worker consumer to a queue.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<queue>', 'queue ID or name')
    .argument('<worker>', 'worker script name')
    .option('--batch <n>', 'max batch size (default 10)', '10')
    .option('--wait <ms>', 'max batch wait in ms (default 5000)', '5000')
    .option('--retries <n>', 'max retries (default 3)', '3')
    .action(async (acct, queue, worker, opts) => {
      try {
        const qid = await resolveQueue(acct, queue)
        const body = {
          script_name: worker,
          type: 'worker',
          settings: {
            batch_size: parseInt(opts.batch),
            max_wait_time_ms: parseInt(opts.wait),
            max_retries: parseInt(opts.retries),
          },
        }
        const resp = await api('POST', `accounts/${acct}/queues/${qid}/consumers`, body)
        if (resp.success) {
          out({ success: true, consumer_id: resp.result?.consumer_id || resp.result?.queue_consumer_id })
        } else {
          out(resp)
        }
      } catch (e) { die(e.message) }
    })

  cmd
    .command('del-consumer')
    .alias('rm-consumer')
    .description('Remove a consumer from a queue.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<queue>', 'queue ID or name')
    .argument('<consumer_id>', 'consumer ID')
    .action(async (acct, queue, consumerId) => {
      try {
        const qid = await resolveQueue(acct, queue)
        const resp = await api('DELETE', `accounts/${acct}/queues/${qid}/consumers/${consumerId}`)
        out({ success: resp.success })
      } catch (e) { die(e.message) }
    })

  cmd
    .command('send')
    .alias('publish')
    .description('Send a message to a queue.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<queue>', 'queue ID or name')
    .argument('<body>', 'message body (JSON string)')
    .action(async (acct, queue, body) => {
      try {
        const qid = await resolveQueue(acct, queue)
        let parsed
        try { parsed = JSON.parse(body) } catch { parsed = body }
        const resp = await api('POST', `accounts/${acct}/queues/${qid}/messages`, {
          body: parsed,
        })
        out({ success: resp.success })
      } catch (e) { die(e.message) }
    })

  cmd
    .command('purge')
    .description('Purge all messages from a queue.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<queue>', 'queue ID or name')
    .action(async (acct, queue) => {
      try {
        const qid = await resolveQueue(acct, queue)
        const resp = await api('POST', `accounts/${acct}/queues/${qid}/purge`)
        out({ success: resp.success })
      } catch (e) { die(e.message) }
    })
}

// Resolve queue name to ID if not already a UUID-like string
async function resolveQueue(acct, queue) {
  if (/^[0-9a-f-]{32,36}$/.test(queue)) return queue
  const resp = await api('GET', `accounts/${acct}/queues?per_page=100`)
  const match = (resp.result || []).find(q => q.queue_name === queue)
  if (!match) throw new Error(`queue '${queue}' not found`)
  return match.queue_id
}
