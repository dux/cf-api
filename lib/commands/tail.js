import { keyApi as api, die } from '../api.js'

// Color helpers for log output
const D = '\x1b[2m'
const R = '\x1b[31m'
const G = '\x1b[32m'
const Y = '\x1b[33m'
const C = '\x1b[36m'
const X = '\x1b[0m'

function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toISOString().replace('T', ' ').replace('Z', '')
}

function fmtStatus(code) {
  if (!code) return ''
  if (code >= 500) return `${R}${code}${X}`
  if (code >= 400) return `${Y}${code}${X}`
  if (code >= 200 && code < 300) return `${G}${code}${X}`
  return String(code)
}

function fmtOutcome(outcome) {
  if (outcome === 'ok') return `${G}ok${X}`
  if (outcome === 'exception' || outcome === 'exceededCpu' || outcome === 'exceededMemory') return `${R}${outcome}${X}`
  if (outcome === 'canceled') return `${Y}canceled${X}`
  return outcome || ''
}

function printEvent(event, format) {
  if (format === 'json') {
    process.stdout.write(JSON.stringify(event) + '\n')
    return
  }

  const ts = fmtTime(event.eventTimestamp)
  const outcome = fmtOutcome(event.outcome)

  // HTTP request info
  if (event.event?.request) {
    const req = event.event.request
    const method = req.method || ''
    const url = req.url || ''
    const status = fmtStatus(event.event?.response?.status)
    process.stderr.write(`${D}${ts}${X}  ${method} ${url}  ${status}  ${outcome}\n`)
  } else if (event.event?.cron) {
    process.stderr.write(`${D}${ts}${X}  ${C}cron${X} ${event.event.cron}  ${outcome}\n`)
  } else if (event.event?.queue) {
    process.stderr.write(`${D}${ts}${X}  ${C}queue${X} ${event.event.queue}  ${outcome}\n`)
  } else {
    process.stderr.write(`${D}${ts}${X}  ${outcome}\n`)
  }

  // console.log messages
  const logs = event.logs || []
  for (const log of logs) {
    const level = log.level || 'log'
    const msg = (log.message || []).join(' ')
    if (level === 'error') {
      process.stderr.write(`  ${R}${level}${X}  ${msg}\n`)
    } else if (level === 'warning' || level === 'warn') {
      process.stderr.write(`  ${Y}${level}${X}  ${msg}\n`)
    } else {
      process.stderr.write(`  ${D}${level}${X}  ${msg}\n`)
    }
  }

  // exceptions
  const exceptions = event.exceptions || []
  for (const ex of exceptions) {
    process.stderr.write(`  ${R}exception${X}  ${ex.name}: ${ex.message}\n`)
  }
}

export function register(program) {
  program
    .command('tail')
    .alias('logs')
    .description(`Stream live logs from a Worker.

  Shows real-time console.log output, HTTP requests, errors, and exceptions.
  Press Ctrl+C to stop.

  Examples:
    cf-api tail <acct> <worker>
    cf-api tail <acct> <worker> --format json
    cf-api tail <acct> <worker> --status error
    cf-api tail <acct> <worker> --search "user"
    cf-api tail <acct> <worker> --method GET --method POST
    cf-api tail <acct> <worker> --ip self
    cf-api tail <acct> <worker> --sample 0.1    10% of requests`)
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<worker>', 'worker script name')
    .option('--format <fmt>', 'output format: pretty or json', 'pretty')
    .option('--status <status...>', 'filter: ok, error, canceled')
    .option('--method <method...>', 'filter by HTTP method')
    .option('--search <text>', 'filter by text in console.log')
    .option('--ip <ip...>', 'filter by client IP ("self" for yours)')
    .option('--sample <rate>', 'sampling rate 0-1', '1')
    .action(async (acct, worker, opts) => {
      try {
        // create tail
        const resp = await api('POST', `accounts/${acct}/workers/scripts/${worker}/tails`, {})
        if (!resp.success) {
          const msg = (resp.errors || []).map(e => e.message).join(', ')
          die(`failed to create tail: ${msg}`)
        }

        const tailId = resp.result?.id
        const wsUrl = resp.result?.url
        if (!wsUrl) die('no WebSocket URL returned from tail API')

        process.stderr.write(`${D}tailing${X} ${worker} ${D}(ctrl+c to stop)${X}\n\n`)

        // build filters message
        const filters = {}
        if (opts.status) filters.outcome = opts.status
        if (opts.method) filters.method = opts.method
        if (opts.search) filters.query = opts.search
        if (opts.ip) filters.client_ip = opts.ip
        if (opts.sample && opts.sample !== '1') filters.sampling_rate = parseFloat(opts.sample)

        // connect WebSocket
        const ws = new WebSocket(wsUrl)

        ws.addEventListener('open', () => {
          // send filters if any
          if (Object.keys(filters).length > 0) {
            ws.send(JSON.stringify({ filters }))
          }
        })

        ws.addEventListener('message', (event) => {
          try {
            const data = JSON.parse(event.data)
            printEvent(data, opts.format)
          } catch {
            process.stderr.write(event.data + '\n')
          }
        })

        ws.addEventListener('error', (event) => {
          process.stderr.write(`${R}websocket error${X}\n`)
        })

        ws.addEventListener('close', () => {
          process.stderr.write(`\n${D}tail closed${X}\n`)
          process.exit(0)
        })

        // cleanup on ctrl+c
        const cleanup = async () => {
          process.stderr.write(`\n${D}stopping tail...${X}\n`)
          ws.close()
          try {
            await api('DELETE', `accounts/${acct}/workers/scripts/${worker}/tails/${tailId}`)
          } catch {}
          process.exit(0)
        }

        process.on('SIGINT', cleanup)
        process.on('SIGTERM', cleanup)
      } catch (e) { die(e.message) }
    })
}
