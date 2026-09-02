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
})
