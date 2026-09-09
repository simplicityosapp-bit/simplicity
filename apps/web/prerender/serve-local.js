/* ════════════════════════════════════════════════════════════════
   SERVE-LOCAL — dist/ served the way Vercel serves it.
   ════════════════════════════════════════════════════════════════
     node prerender/serve-local.js        (after `npm run build`)
     → http://127.0.0.1:5199

   Why this exists rather than `vite preview`: the prerender only works
   because of how Vercel ORDERS its routing, and preview does not model
   that at all. The order is the whole contract:

     1. the filesystem     — "/" resolves to dist/index.html and stops
                             there; a rewrite for "/" is never consulted
     2. vercel.json rewrites, in order, first match wins
     3. the SPA shell      — whatever the catch-all points at

   Step 1 is the one that bites. A local server written the obvious way
   applies rewrites first, which makes a broken "/" look perfectly fine
   locally and ship anyway — that is exactly how the homepage went out
   serving an empty page while every /legal URL worked.

   The rewrite table is read from vercel.json rather than restated here,
   so this cannot drift from what production does. What it deliberately
   does NOT model: api/ functions (so /p/<slug> and /lead/<slug> fall
   through to the shell here — check those against a deploy), headers,
   caching, and redirects.
   ════════════════════════════════════════════════════════════════ */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const webRoot = fileURLToPath(new URL('..', import.meta.url))
const dist = path.join(webRoot, 'dist')
const port = Number(process.argv[2] || 5199)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

const { rewrites = [] } = JSON.parse(await readFile(path.join(webRoot, 'vercel.json'), 'utf8'))

/* vercel.json `source` → RegExp. Covers the two shapes this file uses:
   a literal path, and ":param" / "(.*)" segments. */
function sourceMatcher(source) {
  const pattern = source
    .replace(/[.+?^${}()|[\]\\]/g, (c) => (c === '(' || c === ')' ? c : `\\${c}`))
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '[^/]+')
  return new RegExp(`^${pattern}$`)
}

/* A rule's `has` conditions — only the query form is used here. */
function hasMatches(has, query) {
  return (has ?? []).every((c) => c.type === 'query' && query.get(c.key) === c.value)
}

const rules = rewrites.map((r) => ({ ...r, re: sourceMatcher(r.source) }))

function rewriteFor(pathname, query) {
  const hit = rules.find((r) => r.re.test(pathname) && hasMatches(r.has, query))
  return hit ? hit.destination.split('?')[0] : null
}

const read = (rel) => readFile(path.join(dist, rel.replace(/^\//, ''))).catch(() => null)

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')

  /* 1. filesystem first — this is the step that makes "/" work. */
  let file = url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname
  let body = await read(file)

  /* 2. rewrites, only once the filesystem has missed. */
  if (!body) {
    const target = rewriteFor(url.pathname, url.searchParams)
    if (target) {
      file = target
      body = await read(target)
    }
  }

  if (!body) {
    res.writeHead(404, { 'Content-Type': TYPES['.txt'] })
    return res.end(`no file and no rewrite for ${url.pathname}\n`)
  }

  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' })
  res.end(body)
}).listen(port, '127.0.0.1', () => {
  console.log(`serving ${path.relative(webRoot, dist)} on http://127.0.0.1:${port} — filesystem, then ${rules.length} rewrites`)
})
