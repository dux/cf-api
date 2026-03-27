import { keyApi as api, out, die } from '../api.js'

export function register(program) {
  const cmd = program
    .command('secret')
    .alias('secrets')
    .description(`Worker secrets management.
  Examples:
    cf-api secret list <acct> <worker>
    cf-api secret set <acct> <worker> <key> <value>
    cf-api secret del <acct> <worker> <key>`)

  cmd
    .command('list')
    .alias('ls')
    .description('List secrets for a worker.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<worker>', 'worker script name')
    .action(async (acct, worker) => {
      try {
        const resp = await api('GET', `accounts/${acct}/workers/scripts/${worker}/secrets`)
        out((resp.result || []).map(s => ({ name: s.name, type: s.type })))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('set')
    .alias('put')
    .description('Create or update a secret.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<worker>', 'worker script name')
    .argument('<key>', 'secret name')
    .argument('<value>', 'secret value')
    .action(async (acct, worker, key, value) => {
      try {
        const resp = await api('PUT', `accounts/${acct}/workers/scripts/${worker}/secrets`, {
          name: key,
          text: value,
          type: 'secret_text',
        })
        if (resp.success) {
          out({ success: true, name: key })
        } else {
          out(resp)
        }
      } catch (e) { die(e.message) }
    })

  cmd
    .command('del')
    .aliases(['delete', 'rm'])
    .description('Delete a secret.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<worker>', 'worker script name')
    .argument('<key>', 'secret name')
    .action(async (acct, worker, key) => {
      try {
        const resp = await api('DELETE', `accounts/${acct}/workers/scripts/${worker}/secrets/${key}`)
        out({ success: resp.success })
      } catch (e) { die(e.message) }
    })
}
