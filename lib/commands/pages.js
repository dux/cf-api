import { api, out, die } from '../api.js'

export function register(program) {
  const cmd = program
    .command('pages')
    .description(`Cloudflare Pages project management.
  Examples:
    cf-api pages list ACCOUNT_ID
    cf-api pages get ACCOUNT_ID my-site
    cf-api pages deployments ACCOUNT_ID my-site`)

  cmd
    .command('list')
    .alias('ls')
    .description('List Pages projects.')
    .argument('<account_id>', 'Cloudflare account ID')
    .action(async (acct) => {
      try {
        const resp = await api('GET', `accounts/${acct}/pages/projects`)
        out((resp.result || []).map(p => ({
          name: p.name, subdomain: p.subdomain,
          production_branch: p.production_branch, created_on: p.created_on
        })))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('get')
    .alias('info')
    .description('Get project details.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<name>', 'project name')
    .action(async (acct, name) => {
      try {
        const resp = await api('GET', `accounts/${acct}/pages/projects/${name}`)
        const p = resp.result
        out({
          name: p.name, subdomain: p.subdomain, domains: p.domains,
          production_branch: p.production_branch,
          deployment_configs: p.deployment_configs
        })
      } catch (e) { die(e.message) }
    })

  cmd
    .command('deployments')
    .alias('deploys')
    .description('List deployments for a project.')
    .argument('<account_id>', 'Cloudflare account ID')
    .argument('<name>', 'project name')
    .action(async (acct, name) => {
      try {
        const resp = await api('GET', `accounts/${acct}/pages/projects/${name}/deployments`)
        out((resp.result || []).map(d => ({
          id: d.id, url: d.url, environment: d.environment,
          created_on: d.created_on, latest_stage: d.latest_stage
        })))
      } catch (e) { die(e.message) }
    })
}
