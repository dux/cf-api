import { api, out, die } from '../api.js'

export function register(program) {
  const cmd = program
    .command('d1')
    .description(`D1 SQL database management.
  Examples:
    cf-api d1 list <acct>
    cf-api d1 info <acct> <db>
    cf-api d1 create <acct> <name>
    cf-api d1 del <acct> <db>
    cf-api d1 query <acct> <db> "SELECT * FROM users"
    cf-api d1 export <acct> <db>`)

  cmd
    .command('list')
    .alias('ls')
    .description('List D1 databases.')
    .argument('<account_id>', 'Cloudflare account ID')
    .action(async (acct) => {
      try {
        const resp = await api('GET', `accounts/${acct}/d1/database?per_page=100`)
        out((resp.result || []).map(d => ({
          uuid: d.uuid, name: d.name, version: d.version,
          num_tables: d.num_tables, file_size: d.file_size,
          created_at: d.created_at,
        })))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('info')
    .alias('get')
    .description('Get database details.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<database>', 'database ID or name')
    .action(async (acct, db) => {
      try {
        const dbId = await resolveDb(acct, db)
        const resp = await api('GET', `accounts/${acct}/d1/database/${dbId}`)
        out(resp.result)
      } catch (e) { die(e.message) }
    })

  cmd
    .command('create')
    .description('Create a D1 database.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<name>', 'database name')
    .action(async (acct, name) => {
      try {
        const resp = await api('POST', `accounts/${acct}/d1/database`, { name })
        if (resp.success) {
          out({ success: true, uuid: resp.result.uuid, name: resp.result.name })
        } else {
          out(resp)
        }
      } catch (e) { die(e.message) }
    })

  cmd
    .command('del')
    .aliases(['delete', 'rm'])
    .description('Delete a D1 database.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<database>', 'database ID or name')
    .action(async (acct, db) => {
      try {
        const dbId = await resolveDb(acct, db)
        const resp = await api('DELETE', `accounts/${acct}/d1/database/${dbId}`)
        out({ success: resp.success })
      } catch (e) { die(e.message) }
    })

  cmd
    .command('query')
    .aliases(['exec', 'sql'])
    .description('Execute SQL against a D1 database.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<database>', 'database ID or name')
    .argument('<sql>', 'SQL statement to execute')
    .action(async (acct, db, sql) => {
      try {
        const dbId = await resolveDb(acct, db)
        const resp = await api('POST', `accounts/${acct}/d1/database/${dbId}/query`, { sql })
        if (!resp.success) { out(resp); return }
        const results = resp.result || []
        // d1 query returns array of result sets
        for (const rs of results) {
          if (rs.results?.length > 0) {
            out(rs.results)
          } else {
            out({
              success: rs.success,
              changes: rs.meta?.changes || 0,
              duration: rs.meta?.duration || 0,
              rows_read: rs.meta?.rows_read || 0,
              rows_written: rs.meta?.rows_written || 0,
            })
          }
        }
      } catch (e) { die(e.message) }
    })

  cmd
    .command('export')
    .description('Export database as SQL dump.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<database>', 'database ID or name')
    .option('--no-schema', 'skip schema, export data only')
    .option('--no-data', 'skip data, export schema only')
    .action(async (acct, db, opts) => {
      try {
        const dbId = await resolveDb(acct, db)
        const body = { output_format: 'file' }
        if (!opts.schema) body.dump_options = { no_schema: true }
        if (!opts.data) body.dump_options = { no_data: true }

        // start export
        const resp = await api('POST', `accounts/${acct}/d1/database/${dbId}/export`, body)
        if (!resp.success) { out(resp); return }

        // poll for completion
        const bookmark = resp.result?.signed_url || resp.result?.bookmark
        if (resp.result?.signed_url) {
          // direct download URL
          const res = await fetch(resp.result.signed_url)
          process.stdout.write(await res.text())
          return
        }

        // poll-based export
        if (resp.result?.status === 'complete' && resp.result?.signed_url) {
          const res = await fetch(resp.result.signed_url)
          process.stdout.write(await res.text())
          return
        }

        // if we got a bookmark, poll
        if (bookmark) {
          for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 2000))
            const poll = await api('POST', `accounts/${acct}/d1/database/${dbId}/export`, {
              ...body,
              current_bookmark: bookmark,
            })
            if (poll.result?.status === 'complete' && poll.result?.signed_url) {
              const res = await fetch(poll.result.signed_url)
              process.stdout.write(await res.text())
              return
            }
            if (!poll.success) { out(poll); return }
          }
          die('export timed out after 60s')
        }

        out(resp)
      } catch (e) { die(e.message) }
    })
}

// Resolve db name to UUID if not already a UUID
async function resolveDb(acct, db) {
  if (/^[0-9a-f-]{36}$/.test(db)) return db
  const resp = await api('GET', `accounts/${acct}/d1/database?name=${db}&per_page=10`)
  const match = (resp.result || []).find(d => d.name === db)
  if (!match) throw new Error(`D1 database '${db}' not found`)
  return match.uuid
}
