/* ════════════════════════════════════════════════════════════════
   AUTH RETURN PATH — where a sign-in lands someone who arrived on a link.

   A logged-out visitor following a link into the app is bounced to /login,
   and the wanted path rides the router location back. That works for a
   password sign-in and cannot work for Google, which leaves the page and
   returns at the origin with the router state gone — so the path is stashed
   in sessionStorage on the way out.

   A stash is the kind of thing that fails quietly: too long a life and a
   sign-in gets redirected to a page the person stopped thinking about half an
   hour ago; read twice and the SECOND thing they do in that tab is hijacked
   too. And every value in here traces back to a URL a visitor typed, so the
   guard is the difference between "back to the client file you clicked" and
   "off to somebody else's site".
   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  isReturnable, stashReturnPath, takeReturnPath,
  AUTH_RETURN_KEY, AUTH_RETURN_MAX_AGE_MS,
} from '../src/lib/authReturn'

const AUTH_PATHS = new Set(['/login', '/signup', '/reset-password', '/update-password'])
const ok = (p) => isReturnable(p, AUTH_PATHS)

/* The suite runs in node with no DOM, and one test file is not worth a jsdom
   dependency — sessionStorage is a three-method object. Being a stub is also
   what lets the last test here take it away, which is the branch the real
   code guards with try/catch and which a real browser only reaches in private
   mode. */
function fakeStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  }
}

beforeEach(() => { globalThis.window = { sessionStorage: fakeStorage() } })
afterEach(() => { vi.useRealTimers(); delete globalThis.window })

describe('is it a place we may send someone', () => {
  it('accepts our own paths, with or without a query', () => {
    expect(ok('/clients')).toBe(true)
    expect(ok('/clients/abc-123')).toBe(true)
    expect(ok('/finance?tab=income')).toBe(true)
  })

  it('refuses somebody else\'s site — the whole point of the guard', () => {
    expect(ok('//evil.example.com')).toBe(false)
    expect(ok('https://evil.example.com')).toBe(false)
    expect(ok('javascript:alert(1)')).toBe(false)
  })

  it('refuses the auth screens themselves — that is a loop, not a destination', () => {
    expect(ok('/login')).toBe(false)
    expect(ok('/signup')).toBe(false)
    expect(ok('/update-password')).toBe(false)
    expect(ok('/login?next=/clients')).toBe(false)
  })

  it('refuses anything that is not a path at all', () => {
    expect(ok('')).toBe(false)
    expect(ok('clients')).toBe(false)
    expect(ok(null)).toBe(false)
    expect(ok(undefined)).toBe(false)
    expect(ok(42)).toBe(false)
  })
})

describe('the stash across the OAuth round trip', () => {
  it('gives the path back once', () => {
    stashReturnPath('/clients/abc')
    expect(takeReturnPath()).toBe('/clients/abc')
  })

  it('is one-shot — a second read finds nothing', () => {
    stashReturnPath('/clients/abc')
    takeReturnPath()
    expect(takeReturnPath()).toBeNull()
    expect(window.sessionStorage.getItem(AUTH_RETURN_KEY)).toBeNull()
  })

  it('returns null when nothing was stashed', () => {
    expect(takeReturnPath()).toBeNull()
  })

  it('stashes nothing for a visitor who just came to log in', () => {
    stashReturnPath(undefined)
    stashReturnPath('')
    expect(window.sessionStorage.getItem(AUTH_RETURN_KEY)).toBeNull()
  })

  it('expires, so an abandoned flow cannot redirect a later sign-in', () => {
    vi.useFakeTimers()
    stashReturnPath('/clients/abc')
    vi.advanceTimersByTime(AUTH_RETURN_MAX_AGE_MS + 1000)
    expect(takeReturnPath()).toBeNull()
  })

  it('survives a round trip that is slow but not abandoned', () => {
    vi.useFakeTimers()
    stashReturnPath('/clients/abc')
    vi.advanceTimersByTime(AUTH_RETURN_MAX_AGE_MS - 1000)
    expect(takeReturnPath()).toBe('/clients/abc')
  })

  it('clears junk rather than choking on it', () => {
    window.sessionStorage.setItem(AUTH_RETURN_KEY, 'not json')
    expect(takeReturnPath()).toBeNull()
    expect(window.sessionStorage.getItem(AUTH_RETURN_KEY)).toBeNull()

    window.sessionStorage.setItem(AUTH_RETURN_KEY, JSON.stringify({ path: 5, at: Date.now() }))
    expect(takeReturnPath()).toBeNull()
  })

  it('goes quiet when storage is unavailable, rather than taking the page down', () => {
    globalThis.window = {
      get sessionStorage() { throw new Error('SecurityError: storage is disabled') },
    }
    expect(() => stashReturnPath('/clients/abc')).not.toThrow()
    expect(takeReturnPath()).toBeNull()
  })
})
