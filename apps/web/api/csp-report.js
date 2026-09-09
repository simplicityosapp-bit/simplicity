/* ════════════════════════════════════════════════════════════════
   CSP REPORTS — where Content-Security-Policy violations actually land.
   ════════════════════════════════════════════════════════════════
   The policy in vercel.json has always been Report-Only, which means the
   browser never blocks anything and instead reports what it WOULD have
   blocked. With nowhere to report to, that made the whole policy decorative:
   two real errors sat in it for months (a stale inline-script hash and a
   missing Google Maps frame host) with nothing anywhere to notice.

   This is that missing destination. It exists so the policy can be trusted
   before it is ever enforced: run in Report-Only, read what shows up here,
   and only then decide to enforce.

   Two things had to be fixed before any of that was true, and both were
   found on 2026-09-09 while trying to read what the policy had reported.

   It never parsed a real report. Vercel fills req.body only for content types
   it recognises, and a browser sends a CSP report as application/csp-report
   or application/reports+json — neither of which it parses. req.body was
   undefined, so the body was empty, so there was nothing to log. The same
   payload posted as application/json went through and the two real ones did
   not. See readStream below: the body is read off the request now.

   And it logged where nothing is kept. Vercel's function logs are not
   retained for querying on this plan — a two-hour window returned zero lines,
   even for API calls made inside it. So violations now go to the
   csp_violations table (migration 0117), which can still be read on Thursday.

   Between them, every report this endpoint has ever been sent was discarded,
   including the ones every page load was generating while the two pinned
   script hashes matched nothing in production.

   Reached at /api/csp-report — Vercel matches the filesystem before the
   catch-all rewrite in vercel.json, which is the same way /api/page works.

   DESIGN NOTES
   - Public and unauthenticated, because browsers post these with no
     credentials. It holds no secret beyond the publishable key and cannot
     read anything back: the table it feeds has RLS on with no policy, and
     the write happens in the `csp-report` edge function behind a per-IP rate
     limit and a cap on violations per request. A forged report costs a row
     in a diagnostic table that exists to be dropped.
   - Always answers 204, even on garbage. A report endpoint that errors makes
     browsers retry, and a violation is not worth a retry storm.
   - Extension noise is dropped. A large share of real-world CSP reports come
     from the user's own browser extensions injecting scripts into the page;
     they are not our bug and they drown the signal that is.
   ════════════════════════════════════════════════════════════════ */

const MAX_BODY = 16 * 1024

const SUPABASE_URL = 'https://rdurkakzyymxhocvhufw.supabase.co'
// Publishable (anon) key — the same one shipped in the client bundle and used
// by api/page.js; safe to embed. The edge function it calls holds the service
// role, which is what actually writes the table.
const ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_vr-jk0ptqv6xdF-NRTMQ6w_RIQYkZ5A'

/* Hand the surviving violations to the edge function that can write them.
   Best-effort by design: a report is a diagnostic, and losing one must never
   turn into an error the browser sees or a retry it makes. The timeout is
   there because this runs before the 204 — a slow Supabase must not hold a
   beacon open. */
async function store(req, violations) {
  /* Only ever from a real deployment. This endpoint's own test suite calls
     the handler directly with fixture violations, and vitest does not stub
     fetch — so without a guard `npm test` posts them to the production table.
     It did, twice, before this existed: evil.test and vimeo.test landed in
     csp_violations from a local test run.

     The guard reads the REQUEST, not the environment. `process.env.VERCEL` is
     the obvious choice and it does not work here: it only exists when the
     project has "Automatically expose System Environment Variables" switched
     on, which this one does not — the first version of this guard shipped,
     was live, and silently forwarded nothing. `x-vercel-id` is set by the
     edge on every request that actually reaches a function, so a real report
     always carries it and a hand-built test request never does. */
  if (!(req.headers && (req.headers['x-vercel-id'] || process.env.VERCEL))) return
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/csp-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ violations }),
      signal: AbortSignal.timeout(2000),
    })
  } catch { /* swallowed on purpose — see above */ }
}

/* Violations that are somebody's browser extension, not this app. */
const NOISE = /^(chrome-extension|moz-extension|safari-extension|safari-web-extension|webkit-masked-url|about|blob|data):/i

/* Read the request stream ourselves. Vercel populates req.body only for
   content types it recognises, and application/json is the one that matters
   here — because the two types browsers ACTUALLY send a CSP report as are
   application/csp-report (report-uri) and application/reports+json (the
   Reporting API), and neither is parsed. req.body is undefined for both.

   That is not a detail: it means this endpoint recorded nothing at all from
   the day it was written. Not the table, which is new — the log line too.
   Measured 2026-09-09 by posting one identical payload three times, changing
   only the Content-Type: the application/json copy arrived, the two real
   ones did not. */
async function readStream(req) {
  if (typeof req?.[Symbol.asyncIterator] !== 'function') return ''
  try {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > MAX_BODY) return ''
      chunks.push(chunk)
    }
    return Buffer.concat(chunks).toString('utf8')
  } catch {
    return ''
  }
}

async function parseBody(req) {
  const raw = req.body
  if (raw && typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw
  let text = Buffer.isBuffer(raw) ? raw.toString('utf8') : typeof raw === 'string' ? raw : ''
  if (!text) text = await readStream(req)
  if (!text || text.length > MAX_BODY) return null
  try { return JSON.parse(text) } catch { return null }
}

/* Two wire formats reach here: report-uri sends { "csp-report": {...} }, and
   the newer Reporting API sends an array of { type, body }. Normalise both to
   the flat shape so the log line reads the same whichever browser sent it. */
function normalise(payload) {
  const out = []
  if (Array.isArray(payload)) {
    for (const item of payload) {
      if (item && item.type === 'csp-violation' && item.body) out.push(item.body)
    }
  } else if (payload && payload['csp-report']) {
    out.push(payload['csp-report'])
  } else if (payload && (payload.blockedURL || payload['blocked-uri'])) {
    out.push(payload)
  }
  return out
}

const pick = (r, ...keys) => {
  for (const k of keys) if (r[k]) return String(r[k]).slice(0, 300)
  return ''
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }

  try {
    const violations = []
    for (const r of normalise(await parseBody(req))) {
      const blocked = pick(r, 'blockedURL', 'blocked-uri')
      if (NOISE.test(blocked)) continue
      const directive = pick(r, 'effectiveDirective', 'effective-directive', 'violated-directive')
      const doc = pick(r, 'documentURL', 'document-uri')
      const source = pick(r, 'sourceFile', 'source-file')
      if (NOISE.test(source)) continue
      const v = {
        directive, blocked, doc, source,
        line: r.lineNumber ?? r['line-number'] ?? null,
        sample: pick(r, 'scriptSample', 'script-sample'),
      }
      // Still one line per violation: the logs are gone within the hour, but
      // they are the only reader while tailing a deploy live.
      console.warn('[csp] violation', JSON.stringify(v))
      violations.push(v)
    }
    if (violations.length) await store(req, violations)
  } catch (e) {
    console.error('[csp] report handler error', e)
  }

  // 204 regardless: the browser has nothing useful to do with a failure here.
  return res.status(204).end()
}
