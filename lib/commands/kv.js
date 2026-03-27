import { api, out, die } from '../api.js'

export function register(program) {
  const cmd = program
    .command('kv')
    .description(`Workers KV key-value store.
  Examples:
    cf-api kv ns ACCOUNT_ID                         - list namespaces
    cf-api kv keys ACCOUNT_ID NAMESPACE_ID          - list keys
    cf-api kv keys ACCOUNT_ID NAMESPACE_ID --prefix user:
    cf-api kv get ACCOUNT_ID NAMESPACE_ID mykey     - get value
    cf-api kv set ACCOUNT_ID NAMESPACE_ID mykey val - set value
    cf-api kv del ACCOUNT_ID NAMESPACE_ID mykey     - delete key`)

  cmd
    .command('ns')
    .alias('namespaces')
    .description('List KV namespaces.')
    .argument('<account_id>', 'Cloudflare account ID')
    .action(async (acct) => {
      try {
        const resp = await api('GET', `accounts/${acct}/storage/kv/namespaces?per_page=100`)
        out((resp.result || []).map(n => ({ id: n.id, title: n.title })))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('keys')
    .description('List keys in a namespace.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<namespace_id>', 'KV namespace ID')
    .option('--prefix <prefix>', 'filter keys by prefix')
    .action(async (acct, ns, opts) => {
      try {
        let path = `accounts/${acct}/storage/kv/namespaces/${ns}/keys?per_page=1000`
        if (opts.prefix) path += `&prefix=${opts.prefix}`
        const resp = await api('GET', path)
        out((resp.result || []).map(k => k.name))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('get')
    .description('Get value for a key.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<namespace_id>', 'KV namespace ID')
    .argument('<key>', 'key name')
    .action(async (acct, ns, key) => {
      try {
        const resp = await api('GET', `accounts/${acct}/storage/kv/namespaces/${ns}/values/${key}`)
        out(resp)
      } catch (e) { die(e.message) }
    })

  cmd
    .command('set')
    .alias('put')
    .description('Set value for a key.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<namespace_id>', 'KV namespace ID')
    .argument('<key>', 'key name')
    .argument('<value>', 'value to store')
    .action(async (acct, ns, key, value) => {
      try {
        const token = process.env.CF_API_TOKEN
        const headers = {}
        if (token) {
          headers.Authorization = `Bearer ${token}`
        } else {
          headers['X-Auth-Key'] = process.env.CF_API_KEY
          headers['X-Auth-Email'] = process.env.CF_API_EMAIL
        }
        headers['Content-Type'] = 'text/plain'

        const res = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${acct}/storage/kv/namespaces/${ns}/values/${key}`,
          { method: 'PUT', headers, body: value }
        )
        out(await res.json())
      } catch (e) { die(e.message) }
    })

  cmd
    .command('del')
    .aliases(['delete', 'rm'])
    .description('Delete a key.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<namespace_id>', 'KV namespace ID')
    .argument('<key>', 'key name')
    .action(async (acct, ns, key) => {
      try {
        const resp = await api('DELETE', `accounts/${acct}/storage/kv/namespaces/${ns}/values/${key}`)
        out({ success: resp.success })
      } catch (e) { die(e.message) }
    })
}
