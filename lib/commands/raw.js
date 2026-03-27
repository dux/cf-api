import { api, out, die } from '../api.js'

// Human verb -> HTTP method mapping
const VERBS = {
  get:    'GET',
  read:   'GET',
  list:   'GET',
  create: 'POST',
  add:    'POST',
  update: 'PUT',
  set:    'PUT',
  edit:   'PATCH',
  patch:  'PATCH',
  delete: 'DELETE',
  del:    'DELETE',
  rm:     'DELETE',
}

export function register(program) {
  program
    .command('raw')
    .description(`Raw API call. Full access to any Cloudflare endpoint.
  Path is relative to https://api.cloudflare.com/client/v4/

  Verbs: get, list, create, update, edit, delete
    get/list/read  -> reads data
    create/add     -> creates new resource
    update/set     -> replaces resource
    edit/patch     -> partial update
    delete/del/rm  -> removes resource

  Examples:
    cf-api raw get zones
    cf-api raw get zones?name=example.com
    cf-api raw list zones/ZONE_ID/dns_records
    cf-api raw create zones/ZONE_ID/purge_cache '{"purge_everything":true}'
    cf-api raw edit zones/ZONE_ID/settings/ssl '{"value":"full"}'
    cf-api raw delete zones/ZONE_ID/dns_records/RECORD_ID
    cf-api raw list accounts/ACCT_ID/workers/scripts
    cf-api raw list accounts/ACCT_ID/storage/kv/namespaces
    cf-api raw get user/tokens/verify`)
    .argument('<verb>', `action: ${Object.keys(VERBS).join(', ')}`)
    .argument('<path>', 'API path relative to /client/v4/ or full URL')
    .argument('[body]', 'JSON request body')
    .option('-d, --data <body>', 'request body (alternative to positional)')
    .action(async (verb, path, body, opts) => {
      try {
        const method = VERBS[verb.toLowerCase()]
        if (!method) die(`unknown verb '${verb}'. use: ${Object.keys(VERBS).join(', ')}`)
        const data = body || opts.data || undefined
        const resp = await api(method, path, data)
        out(resp)
      } catch (e) {
        die(e.message)
      }
    })
}
