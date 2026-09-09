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

   It used to log and nothing more, which turned out to be the same as having
   nowhere to report to. Vercel's function logs are not retained for querying
   on this plan — a two-hour window returned zero lines on 2026-09-09, even
   for API calls made inside it — so every report ever produced was written
   down and thrown away, including the ones the stale hashes were generating
   on every single page load. Violations now go to the csp_violations table
   (migration 0117) as well, which is a place that can still be read on
   Thursday.

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
async function store(violations) {
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

function parseBody(req) {
  const raw = req.body
  if (raw && typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : typeof raw === 'string' ? raw : ''
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
    for (const r of normalise(parseBody(req))) {
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
    if (violations.length) await store(violations)
  } catch (e) {
    console.error('[csp] report handler error', e)
  }

  // 204 regardless: the browser has nothing useful to do with a failure here.
  return res.status(204).end()
}
