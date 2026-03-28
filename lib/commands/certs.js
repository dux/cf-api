import { api, zoneId, out, die } from '../api.js'

export function register(program) {
  const cmd = program
    .command('certs')
    .alias('cert')
    .description(`Certificates - origin CA certs and client certificates.
  Origin CA: certs for your origin server signed by Cloudflare (trusted by CF proxy).
  Client certs: mTLS certificates for API Shield / authenticated origins.
  Examples:
    cf-api certs origin list example.com
    cf-api certs origin get CERT_ID
    cf-api certs origin create example.com --hostnames example.com,*.example.com
    cf-api certs origin create example.com --hostnames api.example.com --days 365
    cf-api certs origin revoke CERT_ID
    cf-api certs client list example.com
    cf-api certs client get CERT_ID
    cf-api certs client create example.com --csr ./client.csr --days 3650
    cf-api certs client revoke CERT_ID`)

  // --- origin CA certificates ---
  const origin = cmd
    .command('origin')
    .alias('ca')
    .description('Origin CA certificates (signed by Cloudflare, trusted by CF proxy).')

  origin
    .command('list')
    .alias('ls')
    .description('List origin CA certificates for a zone.')
    .argument('<zone>', 'zone name or ID')
    .action(async (zone) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `certificates?zone_id=${zid}`)
        out((resp.result || []).map(c => ({
          id: c.id, hostnames: (c.hostnames || []).join(', '),
          expires_on: c.expires_on, request_type: c.request_type,
          requested_validity: c.requested_validity,
        })))
      } catch (e) { die(e.message) }
    })

  origin
    .command('get')
    .description('Get origin CA certificate details + PEM.')
    .argument('<cert_id>', 'certificate ID')
    .action(async (certId) => {
      try {
        const resp = await api('GET', `certificates/${certId}`)
        out(resp.result)
      } catch (e) { die(e.message) }
    })

  origin
    .command('create')
    .alias('add')
    .description('Create an origin CA certificate.')
    .argument('<zone>', 'zone name or ID (used to determine hostnames)')
    .option('--hostnames <list>', 'comma-separated hostnames (e.g. example.com,*.example.com)')
    .option('--days <n>', 'validity in days (default 5475 = 15 years)', '5475')
    .option('--type <type>', 'key type: rsa or ecdsa (default rsa)', 'rsa')
    .option('--csr <path>', 'path to CSR file (optional, CF generates key if omitted)')
    .action(async (zone, opts) => {
      try {
        const zid = await zoneId(zone)
        const hostnames = opts.hostnames
          ? opts.hostnames.split(',').map(h => h.trim())
          : [zone, `*.${zone}`]

        const body = {
          hostnames,
          requested_validity: parseInt(opts.days),
          request_type: 'origin-' + opts.type,
        }

        if (opts.csr) {
          const { readFileSync } = await import('node:fs')
          body.csr = readFileSync(opts.csr, 'utf8')
        }

        const resp = await api('POST', `certificates`, body)
        if (resp.success) {
          const r = resp.result
          out({
            id: r.id,
            hostnames: (r.hostnames || []).join(', '),
            expires_on: r.expires_on,
            certificate: r.certificate ? '(use -j to see full PEM)' : '-',
            private_key: r.private_key ? '(use -j to see full PEM - SAVE THIS NOW)' : '-',
          })
          if (r.private_key) {
            process.stderr.write('\x1b[33mWARNING: private key is shown only once. Save it now!\x1b[0m\n')
          }
        } else {
          out(resp)
        }
      } catch (e) { die(e.message) }
    })

  origin
    .command('revoke')
    .alias('del')
    .description('Revoke an origin CA certificate.')
    .argument('<cert_id>', 'certificate ID')
    .action(async (certId) => {
      try {
        const resp = await api('DELETE', `certificates/${certId}`)
        out({ success: resp.success, id: resp.result?.id })
      } catch (e) { die(e.message) }
    })

  // --- client certificates (mTLS) ---
  const client = cmd
    .command('client')
    .alias('mtls')
    .description('Client certificates for mTLS / API Shield.')

  client
    .command('list')
    .alias('ls')
    .description('List client certificates for a zone.')
    .argument('<zone>', 'zone name or ID')
    .action(async (zone) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/client_certificates?per_page=100`)
        out((resp.result || []).map(c => ({
          id: c.id, status: c.status,
          common_name: c.common_name || '-',
          fingerprint_sha256: c.fingerprint_sha256 || '-',
          expires_on: c.expires_on,
          issued_on: c.issued_on,
        })))
      } catch (e) { die(e.message) }
    })

  client
    .command('get')
    .description('Get client certificate details.')
    .argument('<zone>', 'zone name or ID')
    .argument('<cert_id>', 'certificate ID')
    .action(async (zone, certId) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('GET', `zones/${zid}/client_certificates/${certId}`)
        out(resp.result)
      } catch (e) { die(e.message) }
    })

  client
    .command('create')
    .alias('add')
    .description('Create a client certificate.')
    .argument('<zone>', 'zone name or ID')
    .option('--csr <path>', 'path to CSR file (required)')
    .option('--days <n>', 'validity in days (default 3650 = 10 years)', '3650')
    .action(async (zone, opts) => {
      try {
        if (!opts.csr) die('--csr is required (path to CSR file)')
        const zid = await zoneId(zone)
        const { readFileSync } = await import('node:fs')
        const body = {
          csr: readFileSync(opts.csr, 'utf8'),
          validity_days: parseInt(opts.days),
        }
        const resp = await api('POST', `zones/${zid}/client_certificates`, body)
        if (resp.success) {
          const r = resp.result
          out({
            id: r.id, status: r.status,
            common_name: r.common_name || '-',
            expires_on: r.expires_on,
            certificate: r.certificate ? '(use -j for full PEM)' : '-',
          })
        } else {
          out(resp)
        }
      } catch (e) { die(e.message) }
    })

  client
    .command('revoke')
    .alias('del')
    .description('Revoke a client certificate.')
    .argument('<zone>', 'zone name or ID')
    .argument('<cert_id>', 'certificate ID')
    .action(async (zone, certId) => {
      try {
        const zid = await zoneId(zone)
        const resp = await api('PUT', `zones/${zid}/client_certificates/${certId}`, { status: 'revoked' })
        out({ success: resp.success, status: resp.result?.status })
      } catch (e) { die(e.message) }
    })
}
