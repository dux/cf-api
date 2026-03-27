import { api, out, die } from '../api.js'

export function register(program) {
  const cmd = program
    .command('r2')
    .description(`R2 object storage bucket management.
  Examples:
    cf-api r2 list ACCOUNT_ID           - list buckets
    cf-api r2 create ACCOUNT_ID mybucket - create bucket
    cf-api r2 del ACCOUNT_ID mybucket    - delete bucket`)

  cmd
    .command('list')
    .alias('ls')
    .description('List R2 buckets.')
    .argument('<account_id>', 'Cloudflare account ID')
    .action(async (acct) => {
      try {
        const resp = await api('GET', `accounts/${acct}/r2/buckets`)
        const buckets = resp.result?.buckets || resp.result || []
        out(buckets.map(b => ({ name: b.name, creation_date: b.creation_date })))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('create')
    .description('Create an R2 bucket.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<name>', 'bucket name')
    .action(async (acct, name) => {
      try {
        const resp = await api('PUT', `accounts/${acct}/r2/buckets/${name}`, {})
        out({ success: resp.success })
      } catch (e) { die(e.message) }
    })

  cmd
    .command('del')
    .aliases(['delete', 'rm'])
    .description('Delete an R2 bucket.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<name>', 'bucket name')
    .action(async (acct, name) => {
      try {
        const resp = await api('DELETE', `accounts/${acct}/r2/buckets/${name}`)
        out({ success: resp.success })
      } catch (e) { die(e.message) }
    })
}
