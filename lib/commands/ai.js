import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CLI = resolve(__dirname, '..', '..', 'cli.js')

export function register(program) {
  program
    .command('ai')
    .argument('<prompt...>', 'what you want to do')
    .description(`Ask AI to run cf-api commands for you.

  Examples:
    cf-api ai add txt dns entry to trifolim.hr
    cf-api ai list all workers
    cf-api ai purge cache for example.com`)
    .action((words) => {
      const input = words.join(' ')
      const help = execSync(`node ${CLI} --help`, { encoding: 'utf8' })
      const prompt = `${help}\n\ntodo: ${input}`

      try {
        execSync(`opencode run "${prompt.replace(/"/g, '\\"')}"`, {
          stdio: 'inherit',
          env: process.env,
        })
      } catch {
        process.exit(1)
      }
    })
}
