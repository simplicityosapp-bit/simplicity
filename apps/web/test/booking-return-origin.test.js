/* ════════════════════════════════════════════════════════════════
   BOOKING RETURN-ORIGIN SUITE — the allow-list that decides where a payer
   lands after paying.

   This is the money path's one client-supplied value. booking-intake is
   public and unauthenticated, so a crafted booking can put anything in
   `origin`, and whatever survives this function becomes the URL a real payer
   is sent to immediately after a real payment on a real Grow page. A wrong
   answer here is a phishing page with perfect timing.

   It used to be accepted on `/^https?:\/\//` alone. These are the shapes that
   test would have waved through.
   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  CANONICAL_ORIGIN, allowedReturnOrigins, returnOrigin,
} from '../../../supabase/functions/booking-intake/returnOrigin.ts'

const allowed = allowedReturnOrigins()

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })

describe('booking return origin', () => {
  it('accepts the canonical origin', () => {
    expect(returnOrigin(CANONICAL_ORIGIN, allowed)).toBe(CANONICAL_ORIGIN)
  })

  it('strips path, query and fragment — an origin is only scheme+host+port', () => {
    expect(returnOrigin(`${CANONICAL_ORIGIN}/book/x?a=1#frag`, allowed)).toBe(CANONICAL_ORIGIN)
  })

  it.each([
    ['a plain hostile origin', 'https://evil.test'],
    ['a lookalike a prefix check would accept', 'https://simplicity-os.com.evil.test'],
    ['the userinfo trick — real origin is evil.test', 'https://simplicity-os.com@evil.test'],
    ['the canonical hidden in a fragment', 'https://evil.test/#https://simplicity-os.com'],
    ['a subdomain that was never allow-listed', 'https://staging.simplicity-os.com'],
    ['an http downgrade of the real host', 'http://simplicity-os.com'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a data: URL', 'data:text/html,<h1>hi'],
    ['a protocol-relative URL', '//evil.test'],
    ['a bare hostname', 'evil.test'],
  ])('refuses %s', (_label, input) => {
    expect(returnOrigin(input, allowed)).toBe(CANONICAL_ORIGIN)
  })

  it.each([[''], [null], [undefined], [{}], [[]], [0], [false]])(
    'falls back to canonical for %s rather than throwing', (input) => {
      expect(returnOrigin(input, allowed)).toBe(CANONICAL_ORIGIN)
    },
  )

  it('honours an origin added through BOOKING_RETURN_ORIGINS', () => {
    const withPreview = allowedReturnOrigins('https://preview.simplicity-os.com, https://staging.test')
    expect(returnOrigin('https://preview.simplicity-os.com', withPreview)).toBe('https://preview.simplicity-os.com')
    expect(returnOrigin('https://staging.test/path', withPreview)).toBe('https://staging.test')
    // and adding one does not open the rest of the internet
    expect(returnOrigin('https://evil.test', withPreview)).toBe(CANONICAL_ORIGIN)
  })

  it('ignores blanks and stray commas in the env list', () => {
    const messy = allowedReturnOrigins(' , https://ok.test ,, ')
    expect(returnOrigin('https://ok.test', messy)).toBe('https://ok.test')
    expect(messy.size).toBe(2) // canonical + the one real entry
  })

  it('always returns something an href can use', () => {
    for (const input of ['https://evil.test', '', 'nonsense', null]) {
      expect(() => new URL(returnOrigin(input, allowed))).not.toThrow()
    }
  })
})
