import { api, out, die } from '../api.js'
import { createHmac, createHash } from 'node:crypto'
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, extname } from 'node:path'

// --- helpers ----------------------------------------------------------------

function getAccount(cmd) {
  const opts = cmd.optsWithGlobals ? cmd.optsWithGlobals() : cmd
  const v = opts.account || process.env.CF_ACCOUNT_ID
  if (!v) die('pass --account <id> or set CF_ACCOUNT_ID env var')
  return v
}

function getBucket(cmd) {
  const opts = cmd.optsWithGlobals ? cmd.optsWithGlobals() : cmd
  const v = opts.bucket || process.env.R2_BUCKET
  if (!v) die('pass --bucket <name> or set R2_BUCKET env var')
  return v
}

const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'image/tiff': '.tiff',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
  'application/json': '.json',
  'application/javascript': '.js',
  'text/css': '.css',
  'text/html': '.html',
  'text/plain': '.txt',
  'application/zip': '.zip',
  'application/gzip': '.gz',
}

function humanSize(bytes) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const val = bytes / (1024 ** exp)
  return exp === 0 ? `${bytes} B` : `${val.toFixed(1)} ${units[exp]}`
}

// --- S3 auth (AWS Signature V4) -------------------------------------------

function r2Endpoint(acct) {
  return process.env.R2_ENDPOINT || `https://${acct}.r2.cloudflarestorage.com`
}

function sha256hex(data) {
  return createHash('sha256').update(data).digest('hex')
}

function r2Sign(method, acct, bucket, objKey, qs, body) {
  const accessKey = process.env.R2_ACCESS_KEY_ID
  const secretKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accessKey || !secretKey) throw new Error('set R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY')

  const now = new Date()
  const datetime = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/, '')
  const date = datetime.slice(0, 8)
  const region = 'auto'
  const service = 's3'

  const base = r2Endpoint(acct)
  const host = new URL(base).host
  const path = bucket ? `/${bucket}${objKey ? '/' + objKey : ''}` : '/'
  const bodyBuf = body ? (Buffer.isBuffer(body) ? body : Buffer.from(body)) : Buffer.alloc(0)
  const payloadHash = sha256hex(bodyBuf)

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${datetime}\n`
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalRequest = [method, path, qs || '', canonicalHeaders, signedHeaders, payloadHash].join('\n')

  const scope = `${date}/${region}/${service}/aws4_request`
  const stringToSign = `AWS4-HMAC-SHA256\n${datetime}\n${scope}\n${sha256hex(canonicalRequest)}`

  let sigKey = createHmac('sha256', `AWS4${secretKey}`).update(date).digest()
  sigKey = createHmac('sha256', sigKey).update(region).digest()
  sigKey = createHmac('sha256', sigKey).update(service).digest()
  sigKey = createHmac('sha256', sigKey).update('aws4_request').digest()
  const signature = createHmac('sha256', sigKey).update(stringToSign).digest('hex')

  return {
    url: `${base}${path}${qs ? '?' + qs : ''}`,
    headers: {
      host,
      'x-amz-date': datetime,
      'x-amz-content-sha256': payloadHash,
      authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
    }
  }
}

async function r2Fetch(method, acct, bucket, objKey, qs, body) {
  const { url, headers } = r2Sign(method, acct, bucket, objKey, qs, body)
  const opts = { method, headers }
  if (body) {
    opts.body = body
    headers['content-length'] = String(Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body))
  }
  const res = await fetch(url, opts)
  return res
}

// Simple XML value extractor
function xmlAll(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g')
  const results = []
  let m
  while ((m = re.exec(xml)) !== null) results.push(m[1].trim())
  return results
}

function xmlOne(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))
  return m ? m[1].trim() : null
}

// --- download helper for URLs -----------------------------------------------

async function downloadToTmp(url) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) die(`failed to download ${url}: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length === 0) die(`downloaded file is empty: ${url}`)

  // detect extension from content-type header or URL
  const ct = res.headers.get('content-type') || ''
  const mime = ct.split(';')[0].trim()
  let ext = MIME_TO_EXT[mime]
  if (!ext) {
    try { ext = extname(new URL(url).pathname) } catch {}
  }
  ext = ext || ''

  const tmp = join(tmpdir(), `cf-r2-${Date.now()}${ext}`)
  writeFileSync(tmp, buf)
  return { path: tmp, ext, size: buf.length }
}

// --- command registration --------------------------------------------------

export function register(program) {
  const cmd = program
    .command('r2')
    .option('-a, --account <id>', 'account ID (or CF_ACCOUNT_ID env)')
    .option('-b, --bucket <name>', 'bucket name (or R2_BUCKET env)')
    .description(`R2 object storage - bucket management and object CRUD.

Env vars (avoid repeating args):
  CF_ACCOUNT_ID        Cloudflare account ID
  R2_ACCESS_KEY_ID     S3 access key (for object ops)
  R2_SECRET_ACCESS_KEY S3 secret key (for object ops)
  R2_BUCKET            default bucket name
  R2_URL               public URL base (for upload-sha1 output)

Bucket management (CF API):
  cf-api r2 list                             - list buckets
  cf-api r2 info <bucket>                    - bucket details
  cf-api r2 create <name>                    - create bucket
  cf-api r2 del <name>                       - delete bucket
  cf-api r2 cors <bucket>                    - get CORS policy
  cf-api r2 metrics                          - account R2 usage stats

Object operations (S3 API, uses R2_BUCKET or --bucket):
  cf-api r2 objects [prefix]                 - list objects in bucket
  cf-api r2 cat <key>                        - print object to stdout
  cf-api r2 put <key> <file>                 - upload local file
  cf-api r2 rm <key>                         - delete object
  cf-api r2 upload-sha1 <file_or_url>        - upload keyed by SHA1 hash

Override account/bucket per-call:
  cf-api r2 objects --account ACCT --bucket my-bucket
  cf-api r2 -a ACCT -b my-bucket put img/logo.png ./logo.png

Generate R2 API tokens at: CF dashboard > R2 > Manage R2 API Tokens`)

  // --- CF API commands ------------------------------------------------------

  cmd
    .command('list')
    .alias('ls')
    .description('List R2 buckets.')
    .action(async function () {
      try {
        const acct = getAccount(this)
        const resp = await api('GET', `accounts/${acct}/r2/buckets`)
        const buckets = resp.result?.buckets || resp.result || []
        out(buckets.map(b => ({ name: b.name, location: b.location || '-', created: b.creation_date })))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('info')
    .description('Get bucket details.')
    .argument('<bucket>', 'bucket name')
    .action(async function (bucket) {
      try {
        const acct = getAccount(this)
        const resp = await api('GET', `accounts/${acct}/r2/buckets/${bucket}`)
        out(resp.result)
      } catch (e) { die(e.message) }
    })

  cmd
    .command('create')
    .description('Create an R2 bucket.')
    .argument('<name>', 'bucket name')
    .action(async function (name) {
      try {
        const acct = getAccount(this)
        const resp = await api('PUT', `accounts/${acct}/r2/buckets/${name}`, {})
        out({ success: resp.success })
      } catch (e) { die(e.message) }
    })

  cmd
    .command('del')
    .aliases(['delete', 'rm-bucket'])
    .description('Delete an R2 bucket.')
    .argument('<name>', 'bucket name')
    .action(async function (name) {
      try {
        const acct = getAccount(this)
        const resp = await api('DELETE', `accounts/${acct}/r2/buckets/${name}`)
        out({ success: resp.success })
      } catch (e) { die(e.message) }
    })

  cmd
    .command('cors')
    .description('Get CORS policy for a bucket.')
    .argument('<bucket>', 'bucket name')
    .action(async function (bucket) {
      try {
        const acct = getAccount(this)
        const resp = await api('GET', `accounts/${acct}/r2/buckets/${bucket}/cors`)
        out(resp.result)
      } catch (e) { die(e.message) }
    })

  cmd
    .command('metrics')
    .description('Account-level R2 usage stats.')
    .action(async function () {
      try {
        const acct = getAccount(this)
        const resp = await api('GET', `accounts/${acct}/r2/metrics`)
        out(resp.result)
      } catch (e) { die(e.message) }
    })

  // --- S3 API commands ------------------------------------------------------

  cmd
    .command('objects')
    .alias('ls-objects')
    .description('List objects in a bucket (uses R2 S3 API).')
    .argument('[prefix]', 'filter by key prefix')
    .option('--max <n>', 'max results', '1000')
    .action(async function (prefix) {
      try {
        const acct = getAccount(this)
        const bucket = getBucket(this)
        const opts = this.opts()
        const qs = new URLSearchParams({ 'list-type': '2', 'max-keys': opts.max })
        if (prefix) qs.set('prefix', prefix)
        const res = await r2Fetch('GET', acct, bucket, null, qs.toString())
        const xml = await res.text()
        if (!res.ok) die(xmlOne(xml, 'Message') || `HTTP ${res.status}`)
        const keys = xmlAll(xml, 'Key')
        const sizes = xmlAll(xml, 'Size')
        const dates = xmlAll(xml, 'LastModified')
        if (!keys.length) { out('(empty)'); return }
        out(keys.map((k, i) => ({
          key: k,
          size: humanSize(Number(sizes[i]) || 0),
          modified: dates[i] ? dates[i].slice(0, 16).replace('T', ' ') : '-',
        })))
      } catch (e) { die(e.message) }
    })

  cmd
    .command('cat')
    .description('Print object content to stdout (uses R2 S3 API).')
    .argument('<key>', 'object key')
    .action(async function (key) {
      try {
        const acct = getAccount(this)
        const bucket = getBucket(this)
        const res = await r2Fetch('GET', acct, bucket, key)
        if (!res.ok) {
          const text = await res.text()
          die(xmlOne(text, 'Message') || `HTTP ${res.status}`)
        }
        const buf = Buffer.from(await res.arrayBuffer())
        process.stdout.write(buf)
      } catch (e) { die(e.message) }
    })

  cmd
    .command('put')
    .description('Upload a local file to a bucket (uses R2 S3 API).')
    .argument('<key>', 'object key (path in bucket)')
    .argument('<file>', 'local file path')
    .action(async function (key, file) {
      try {
        const acct = getAccount(this)
        const bucket = getBucket(this)
        if (!existsSync(file)) die(`file not found: ${file}`)
        const body = readFileSync(file)
        const res = await r2Fetch('PUT', acct, bucket, key, null, body)
        if (!res.ok) {
          const text = await res.text()
          die(xmlOne(text, 'Message') || `HTTP ${res.status}`)
        }
        out({ success: true, key, size: humanSize(body.length) })
      } catch (e) { die(e.message) }
    })

  cmd
    .command('rm')
    .alias('delete-object')
    .description('Delete an object from a bucket (uses R2 S3 API).')
    .argument('<key>', 'object key')
    .action(async function (key) {
      try {
        const acct = getAccount(this)
        const bucket = getBucket(this)
        const res = await r2Fetch('DELETE', acct, bucket, key)
        if (!res.ok) {
          const text = await res.text()
          die(xmlOne(text, 'Message') || `HTTP ${res.status}`)
        }
        out({ success: true, key })
      } catch (e) { die(e.message) }
    })

  // --- upload-sha1 ----------------------------------------------------------

  cmd
    .command('upload-sha1')
    .alias('sha1')
    .description(`Upload file keyed by SHA1 hash to hash/<sha1><ext>.
Accepts a local file path or an HTTP(S) URL.
Same file from any source always lands at the same key.

Examples:
  cf-api r2 upload-sha1 photo.jpg              -> hash/a1b2c3...avif
  cf-api r2 upload-sha1 https://example.com/img.png
  cf-api r2 upload-sha1 data.json`)
    .argument('<file_or_url>', 'local file path or HTTP(S) URL')
    .action(async function (fileOrUrl) {
      let filePath
      let tmpFile = false

      try {
        const acct = getAccount(this)
        const bucket = getBucket(this)

        // resolve source
        if (/^https?:\/\//i.test(fileOrUrl)) {
          const dl = await downloadToTmp(fileOrUrl)
          filePath = dl.path
          tmpFile = true
        } else {
          if (!existsSync(fileOrUrl)) die(`file not found: ${fileOrUrl}`)
          filePath = fileOrUrl
        }

        // read, hash, detect extension
        const data = readFileSync(filePath)
        const sha1 = createHash('sha1').update(data).digest('hex')

        // detect extension from file content or name
        let ext = extname(filePath).toLowerCase()
        if (!ext || ext === '.tmp') {
          // try to detect from first bytes (basic magic number check)
          ext = ''
        }

        const key = `hash/${sha1}${ext}`

        // upload
        const res = await r2Fetch('PUT', acct, bucket, key, null, data)
        if (!res.ok) {
          const text = await res.text()
          die(xmlOne(text, 'Message') || `HTTP ${res.status}`)
        }

        const result = { success: true, key, size: humanSize(data.length), sha1 }

        // add public URL if configured
        const r2Url = process.env.R2_URL
        if (r2Url) {
          result.url = `${r2Url.replace(/\/$/, '')}/${key}`
        }

        out(result)
      } catch (e) {
        die(e.message)
      } finally {
        if (tmpFile && filePath) {
          try { unlinkSync(filePath) } catch {}
        }
      }
    })
}
