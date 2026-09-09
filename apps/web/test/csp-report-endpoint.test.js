/* ════════════════════════════════════════════════════════════════
   CSP REPORT ENDPOINT — the destination the Report-Only policy posts to.

   It is public and unauthenticated (browsers send these with no credentials),
   so what matters is that it stays boring: always 204, never throws, and does
   not drown its own signal in browser-extension noise. Those are the three
   things worth pinning.
   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import handler from '../api/csp-report'

function res() {
  const r = {
    statusCode: null, headers: {}, ended: false,
    setHeader(k, v) { r.headers[k] = v },
    status(code) { r.statusCode = code; return r },
    end() { r.ended = true; return r },
  }
  return r
}
const post = (body, headers = {}) => ({ method: 'POST', headers, body })

let warn
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })

const logged = () => warn.mock.calls.filter((c) => c[0] === '[csp] violation')

describe('CSP report endpoint', () => {
  it('refuses anything but POST', async () => {
    const r = res()
    await handler({ method: 'GET', headers: {} }, r)
    expect(r.statusCode).toBe(405)
    expect(r.headers.Allow).toBe('POST')
  })

  it('accepts the legacy report-uri shape and logs the violation', async () => {
    const r = res()
    await handler(post({
      'csp-report': {
        'document-uri': 'https://simplicity-os.com/home',
        'violated-directive': 'script-src',
        'effective-directive': 'script-src',
        'blocked-uri': 'https://evil.test/x.js',
      },
    }), r)
    expect(r.statusCode).toBe(204)
    expect(logged()).toHaveLength(1)
    expect(logged()[0][1]).toContain('https://evil.test/x.js')
  })

  it('accepts the Reporting API shape too', async () => {
    const r = res()
    await handler(post([
      { type: 'csp-violation', body: { documentURL: 'https://simplicity-os.com/', effectiveDirective: 'frame-src', blockedURL: 'https://vimeo.test/1' } },
      { type: 'deprecation', body: { id: 'ignore-me' } },
    ]), r)
    expect(r.statusCode).toBe(204)
    // Only the csp-violation is a CSP report; the deprecation report is not.
    expect(logged()).toHaveLength(1)
    expect(logged()[0][1]).toContain('frame-src')
  })

  it('drops browser-extension noise, which is most real-world traffic', async () => {
    const r = res()
    for (const blocked of [
      'chrome-extension://abcdef/inject.js',
      'moz-extension://abcdef/inject.js',
      'safari-web-extension://abcdef/inject.js',
    ]) {
      await handler(post({ 'csp-report': { 'blocked-uri': blocked, 'effective-directive': 'script-src' } }), r)
    }
    expect(r.statusCode).toBe(204)
    expect(logged()).toHaveLength(0)
  })

  it('drops a violation whose SOURCE is an extension, even if the target looks real', async () => {
    const r = res()
    await handler(post({
      'csp-report': {
        'blocked-uri': 'https://cdn.test/lib.js',
        'source-file': 'chrome-extension://abcdef/content.js',
        'effective-directive': 'script-src',
      },
    }), r)
    expect(logged()).toHaveLength(0)
  })

  /* A browser posts a CSP report as application/csp-report or
     application/reports+json, and Vercel parses neither into req.body — so a
     real report arrives with req.body undefined and the body still unread on
     the request. Reading it is the difference between this endpoint working
     and silently discarding everything, which is what it did until the stream
     path existed. */
  describe('a body Vercel did not parse', () => {
    /* An IncomingMessage-shaped request: no .body, readable as a stream. */
    const streamed = (text, headers = {}) => ({
      method: 'POST',
      headers,
      async *[Symbol.asyncIterator]() { yield Buffer.from(text, 'utf8') },
    })

    it('reads the violation off the request stream', async () => {
      const r = res()
      await handler(streamed(JSON.stringify({
        'csp-report': { 'effective-directive': 'script-src', 'blocked-uri': 'https://evil.test/x.js' },
      })), r)
      expect(r.statusCode).toBe(204)
      expect(logged()).toHaveLength(1)
      expect(logged()[0][1]).toContain('https://evil.test/x.js')
    })

    it('ignores an oversized stream instead of buffering it', async () => {
      const r = res()
      await handler(streamed('x'.repeat(64 * 1024)), r)
      expect(r.statusCode).toBe(204)
      expect(logged()).toHaveLength(0)
    })

    it('survives a stream that errors mid-read', async () => {
      const r = res()
      await handler({
        method: 'POST', headers: {},
        [Symbol.asyncIterator]() {
          return { next: () => Promise.reject(new Error('connection reset')) }
        },
      }, r)
      expect(r.statusCode).toBe(204)
    })
  })

  it('never throws, whatever it is sent', async () => {
    for (const body of [null, undefined, '', 'not json', '{"broken":', 42, [], {}]) {
      const r = res()
      await expect(handler(post(body), r)).resolves.not.toThrow()
      expect(r.statusCode).toBe(204)
    }
  })

  it('ignores an oversized body instead of logging it', async () => {
    const r = res()
    await handler(post('x'.repeat(64 * 1024)), r)
    expect(r.statusCode).toBe(204)
    expect(logged()).toHaveLength(0)
  })

  /* The handler forwards surviving violations to an edge function that writes
     them to csp_violations. Running this suite must not be a way to write to
     the production table — which it briefly was: the evil.test and vimeo.test
     fixtures above reached it from a local `npm test`. */
  describe('forwarding to the violations table', () => {
    const violation = { 'csp-report': { 'effective-directive': 'script-src', 'blocked-uri': 'https://evil.test/x.js' } }

    /* The guard is on the REQUEST, not the environment: process.env.VERCEL
       only exists when the project exposes system env vars, and this one does
       not — a version of this guard shipped, went live, and forwarded
       nothing. Every request that actually reaches a function carries
       x-vercel-id; a hand-built one like these never does. */
    const fromEdge = { 'x-vercel-id': 'fra1::abc123-1788962771054-0f3f6427a5bb' }

    it('does not reach the network for a request that did not come from the edge', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
      await handler(post(violation), res())
      expect(fetchSpy, 'a test run must never post to production').not.toHaveBeenCalled()
    })

    it('forwards once for a request that came through the edge', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
      await handler(post(violation, fromEdge), res())
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url, init] = fetchSpy.mock.calls[0]
      expect(String(url)).toMatch(/\/functions\/v1\/csp-report$/)
      expect(JSON.parse(init.body).violations[0].blocked).toBe('https://evil.test/x.js')
    })

    it('forwards nothing when every violation was extension noise', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
      await handler(post({ 'csp-report': { 'effective-directive': 'script-src', 'blocked-uri': 'chrome-extension://a/b.js' } }, fromEdge), res())
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('still answers 204 when the forward fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('supabase is down'))
      const r = res()
      await handler(post(violation, fromEdge), r)
      expect(r.statusCode).toBe(204)
    })
  })
})
