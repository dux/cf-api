import { keyApi as api, out, die } from '../api.js'

export function register(program) {
  const cmd = program
    .command('deployments')
    .alias('deploys')
    .description(`Worker deployment history and rollback.
  Examples:
    cf-api deployments list <acct> <worker>
    cf-api deployments versions <acct> <worker>
    cf-api deployments get <acct> <worker> <version_id>
    cf-api deployments rollback <acct> <worker> <version_id>
    cf-api deployments rollback <acct> <worker> <version_id> -m "hotfix revert"`)

  cmd
    .command('list')
    .alias('ls')
    .description('List recent deployments.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<worker>', 'worker script name')
    .action(async (acct, worker) => {
      try {
        const resp = await api('GET', `accounts/${acct}/workers/scripts/${worker}/deployments`)
        if (!resp.success) { out(resp); return }
        out((resp.result?.deployments || resp.result || []).map(d => ({
          id: d.id,
          source: d.source,
          strategy: d.strategy,
          author_email: d.author_email,
          created_on: d.created_on,
          versions: (d.versions || []).map(v => `${v.version_id} (${v.percentage}%)`).join(', '),
        })))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('versions')
    .alias('vers')
    .description('List worker versions.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<worker>', 'worker script name')
    .action(async (acct, worker) => {
      try {
        const resp = await api('GET', `accounts/${acct}/workers/scripts/${worker}/versions`)
        if (!resp.success) { out(resp); return }
        const items = resp.result?.items || resp.result || []
        out(items.map(v => ({
          id: v.id,
          number: v.number,
          source: v.metadata?.source,
          author: v.metadata?.author_email,
          created_on: v.metadata?.created_on,
        })))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('get')
    .alias('info')
    .description('Get a specific version detail.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<worker>', 'worker script name')
    .argument('<version_id>', 'version ID')
    .action(async (acct, worker, versionId) => {
      try {
        const resp = await api('GET', `accounts/${acct}/workers/scripts/${worker}/versions/${versionId}`)
        out(resp.result)
      } catch (e) { die(e.message) }
    })

  cmd
    .command('rollback')
    .alias('revert')
    .description('Rollback to a specific version.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<worker>', 'worker script name')
    .argument('<version_id>', 'version ID to rollback to')
    .option('-m, --message <msg>', 'reason for rollback')
    .action(async (acct, worker, versionId, opts) => {
      try {
        const body = {
          strategy: 'percentage',
          versions: [
            { version_id: versionId, percentage: 100 },
          ],
        }
        if (opts.message) body.annotations = { 'workers/message': opts.message }

        const resp = await api('POST', `accounts/${acct}/workers/scripts/${worker}/deployments`, body)
        if (resp.success) {
          out({ success: true, message: `rolled back to ${versionId}` })
        } else {
          out(resp)
        }
      } catch (e) { die(e.message) }
    })
}
