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

   Reached at /api/csp-report — Vercel matches the filesystem before the
   catch-all rewrite in vercel.json, which is the same way /api/page works.

   DESIGN NOTES
   - Public and unauthenticated, because browsers post these with no
     credentials. It therefore does nothing but log: no database, no fetch,
     nothing an attacker could aim somewhere.
   - Always answers 204, even on garbage. A report endpoint that errors makes
     browsers retry, and a violation is not worth a retry storm.
   - Extension noise is dropped. A large share of real-world CSP reports come
     from the user's own browser extensions injecting scripts into the page;
     they are not our bug and they drown the signal that is.
   ════════════════════════════════════════════════════════════════ */

const MAX_BODY = 16 * 1024

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
    for (const r of normalise(parseBody(req))) {
      const blocked = pick(r, 'blockedURL', 'blocked-uri')
      if (NOISE.test(blocked)) continue
      const directive = pick(r, 'effectiveDirective', 'effective-directive', 'violated-directive')
      const doc = pick(r, 'documentURL', 'document-uri')
      const source = pick(r, 'sourceFile', 'source-file')
      if (NOISE.test(source)) continue
      // One line per violation — Vercel's function logs are the reader.
      console.warn('[csp] violation', JSON.stringify({
        directive, blocked, doc, source,
        line: r.lineNumber ?? r['line-number'] ?? null,
        sample: pick(r, 'scriptSample', 'script-sample'),
      }))
    }
  } catch (e) {
    console.error('[csp] report handler error', e)
  }

  // 204 regardless: the browser has nothing useful to do with a failure here.
  return res.status(204).end()
}
