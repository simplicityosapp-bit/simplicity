/* ════════════════════════════════════════════════════════════════
   PRERENDER BUILD — bake static HTML for the two public routes.
   ════════════════════════════════════════════════════════════════
   Runs straight after `vite build` (see the "build" script). The empty
   shell Vite emitted is preserved as dist/app.html — that is what the
   catch-all rewrite serves, so every route behind the login still gets a
   blank root to mount into. dist/index.html is then REPLACED by the
   prerendered landing page, because Vercel resolves "/" on the filesystem
   before it ever consults the rewrite table (see routes.js). The legal
   documents are not files at their public URLs, so they can be — and are —
   reached by rewrites, and live under dist/prerender/.

   How the HTML is produced: a Vite dev server in middleware mode gives us
   ssrLoadModule(), which runs prerender/entry.jsx through the same
   transform pipeline as the browser build — JSX, the `@` alias, CSS
   imports, the @simplicity/core workspace package. The screens render to
   a string with react-dom/server. No headless browser, so nothing to
   install on the build machine and nothing that can fail for want of a
   system library; and because renderToString never runs effects, the
   build fires no landing-funnel beacons at Supabase.

   Everything it writes is verified before it is written — see verify().
   A silently empty or half-rendered page is worse than no prerender at
   all, so every failure here fails the build.
   ════════════════════════════════════════════════════════════════ */
import { createServer } from 'vite'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { MIN_HTML_BYTES, PRERENDER_ROUTES, SPA_SHELL } from './routes.js'

const webRoot = fileURLToPath(new URL('..', import.meta.url))
const distDir = path.join(webRoot, 'dist')

/* The exact placeholder Vite emits. Matched as a literal (not a regex) so a
   change to the template is a loud failure rather than a silent miss. */
const ROOT_DIV = '<div id="root"></div>'

/* src/lib/supabase.js calls createClient() at module scope, and supabase-js
   throws "supabaseUrl is required" when the URL is undefined — which would
   take the render down before it started. On Vercel the real values are in
   the environment already; locally (and in a git worktree, which has no
   .env.local) these stand in. Nothing is ever sent: the only caller is an
   effect, and renderToString does not run effects. */
process.env.VITE_SUPABASE_URL ||= 'http://prerender.invalid'
process.env.VITE_SUPABASE_ANON_KEY ||= 'prerender-build-placeholder'

/* ── HTML helpers ───────────────────────────────────────────────── */

const ATTR_ESCAPES = { '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }
const ENTITIES = {
  '&amp;': '&',
  '&quot;': '"',
  '&#x27;': "'",
  '&#39;': "'",
  '&lt;': '<',
  '&gt;': '>',
}

function escAttr(value) {
  return String(value).replace(/[&"<>]/g, (c) => ATTR_ESCAPES[c])
}

/* Replace the first match, or fail loudly. index.html is hand-maintained;
   if a tag this script rewrites is renamed or removed, the build must stop
   rather than ship a legal page wearing the homepage's title. */
function replaceOne(html, pattern, replacement, what) {
  const match = html.match(pattern)
  if (!match) {
    throw new Error(`prerender: ${what} not found in dist/index.html — the template changed, update prerender/build.js`)
  }
  return html.slice(0, match.index) + replacement + html.slice(match.index + match[0].length)
}

function setTitle(html, title) {
  return replaceOne(html, /<title>[\s\S]*?<\/title>/, `<title>${escAttr(title)}</title>`, '<title>')
}

function setMeta(html, attr, key, content) {
  const pattern = new RegExp(`<meta[^>]*\\s${attr}="${key}"[^>]*>`)
  return replaceOne(html, pattern, `<meta ${attr}="${key}" content="${escAttr(content)}" />`, `<meta ${attr}="${key}">`)
}

function setCanonical(html, href) {
  return replaceOne(
    html,
    /<link[^>]*\srel="canonical"[^>]*>/,
    `<link rel="canonical" href="${escAttr(href)}" />`,
    'canonical <link>',
  )
}

/* Rendered markup → the plain text a crawler reads, for the parity checks.
   React separates adjacent text children with an empty comment; strip those
   first or a check would fail on markup that is perfectly fine. */
function toText(html) {
  const stripped = html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, '')
  return stripped.replace(/&(?:amp|quot|#x27|#39|lt|gt);/g, (e) => ENTITIES[e])
}

/* ── verification ───────────────────────────────────────────────── */

function verify(route, body, expected, missingI18nKeys) {
  const problems = []

  if (Buffer.byteLength(body, 'utf8') < MIN_HTML_BYTES) {
    problems.push(`rendered only ${Buffer.byteLength(body, 'utf8')} bytes (expected at least ${MIN_HTML_BYTES}) — the screen probably bailed out`)
  }

  if (missingI18nKeys.length) {
    problems.push(`i18next could not resolve ${missingI18nKeys.length} key(s), so raw key names would be baked into the page: ${missingI18nKeys.slice(0, 10).join(', ')}`)
  }

  const text = toText(body)
  const absent = expected.filter((needle) => !text.includes(needle))
  if (absent.length) {
    problems.push(
      `${absent.length} of ${expected.length} expected strings are missing from the rendered page:\n` +
        absent.slice(0, 5).map((s) => `      · ${s.slice(0, 90)}`).join('\n'),
    )
  }

  if (problems.length) {
    throw new Error(`prerender: ${route.location} failed verification\n  - ${problems.join('\n  - ')}`)
  }
}

/* ── main ───────────────────────────────────────────────────────── */

const template = await readFile(path.join(distDir, 'index.html'), 'utf8')
if (!template.includes(ROOT_DIV)) {
  /* Also what you get from running this twice without rebuilding: the
     first run replaced index.html with the rendered landing page, so the
     placeholder is gone. Failing here beats prerendering a prerender. */
  throw new Error(`prerender: "${ROOT_DIV}" not found in dist/index.html — run \`vite build\` first`)
}

/* Keep the empty shell before index.html is overwritten below. */
await writeFile(path.join(distDir, SPA_SHELL), template, 'utf8')

const vite = await createServer({
  root: webRoot,
  appType: 'custom',
  logLevel: 'warn',
  /* No HMR and no file watcher: this is a one-shot render, and a watcher
     would keep the Node process alive after the build is done. */
  server: { middlewareMode: true, hmr: false, watch: null },
})

try {
  const entry = await vite.ssrLoadModule('/prerender/entry.jsx')

  for (const route of PRERENDER_ROUTES) {
    /* Only the keys THIS render failed to resolve. Bracketing the call keeps
       a later probe (landingSentinels below) from being blamed on the page,
       and keeps one route's misses out of the next route's report. */
    const missedBefore = entry.missingKeys().length
    const body = entry.renderRoute(route)
    const missed = entry.missingKeys().slice(missedBefore)

    /* What this page must contain to count as rendered. For the legal
       documents that is EVERY heading and paragraph, read from the same
       content module the app renders — a complete parity check, not a
       sample. For the landing page it is one line per section. */
    const expected = route.legalTab
      ? entry.legalBlocksText(route.legalTab)
      : entry.landingSentinels()

    verify(route, body, expected, missed)

    let html = template.replace(ROOT_DIV, `<div id="root">${body}</div>`)
    /* The <title> and the social title are deliberately separate strings:
       the tab title leads with the Latin brand to match the OAuth consent
       screen, while a shared link keeps its Hebrew card. Setting one must
       never quietly set the other. */
    if (route.title) html = setTitle(html, route.title)
    if (route.socialTitle) {
      html = setMeta(html, 'property', 'og:title', route.socialTitle)
      html = setMeta(html, 'name', 'twitter:title', route.socialTitle)
    }
    if (route.description) {
      html = setMeta(html, 'name', 'description', route.description)
      html = setMeta(html, 'property', 'og:description', route.description)
      html = setMeta(html, 'name', 'twitter:description', route.description)
    }
    if (route.canonical) {
      html = setCanonical(html, route.canonical)
      /* og:url must agree with the canonical, or a share card claims to be
         the homepage while the page is the privacy policy. It is also what
         keeps the file's own /prerender/… URL from competing in search. */
      html = setMeta(html, 'property', 'og:url', route.canonical)
    }

    const target = path.join(distDir, route.out)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, html, 'utf8')

    const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)
    const how = route.rewrite === false ? 'filesystem' : 'rewrite'
    console.log(
      `prerender  ${route.location.padEnd(22)} → dist/${route.out.padEnd(30)} ${kb.padStart(5)} kB  ` +
        `via ${how.padEnd(10)} (${expected.length} strings verified)`,
    )
  }
} finally {
  await vite.close()
}
