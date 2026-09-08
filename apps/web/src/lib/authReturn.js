/* ════════════════════════════════════════════════════════════════
   WHERE A SIGN-IN SHOULD LAND — the page the visitor was going to.
   ════════════════════════════════════════════════════════════════
   A logged-out visitor following a link into the app (a client file someone
   sent them, a bookmark) is bounced to /login, and AuthGate leaves the wanted
   path on the router location so the signed-in catch-all can honour it.

   That works for a password sign-in, which never navigates — the session
   simply arrives and the app re-renders on the same location. It cannot work
   for Google: that leaves the page entirely and comes back at the origin, so
   the router state, and the link the person followed, are gone with it.

   Hence a stash that survives the round trip. sessionStorage, not local: the
   redirect returns to the SAME tab, and a per-tab value cannot leak into the
   other windows someone has open, or outlive the tab it belongs to.
   ════════════════════════════════════════════════════════════════ */

const KEY = 'simplicity_auth_return'

/* Long enough for a real Google round trip — pick an account, type a
   password, approve a second factor — and short enough that a flow abandoned
   halfway does not redirect a later sign-in in the same tab to a page the
   person has since stopped thinking about. */
const MAX_AGE_MS = 10 * 60 * 1000

/* Is `to` a path of our own that we may send someone to after a sign-in?
   Every value here traces back to a URL the visitor typed or followed, so it
   is checked, not trusted: a protocol-relative "//host" is somebody else's
   site, and the auth screens themselves are a loop rather than a
   destination. */
export function isReturnable(to, authPaths) {
  if (typeof to !== 'string' || !to.startsWith('/') || to.startsWith('//')) return false
  return !authPaths.has(to.split('?')[0])
}

/* Called just before an OAuth redirect, with the path the visitor was headed
   for (or nothing, if they simply came to log in). */
export function stashReturnPath(path) {
  try {
    if (typeof path !== 'string' || !path) return
    window.sessionStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }))
  } catch { /* storage unavailable (private mode) — the deep link is lost, which is the old behaviour */ }
}

/* One-shot: reading it takes it. A return path that has been used, or that
   turns out to be too old or malformed, must not be able to fire a second
   time on the next thing that happens in this tab. */
export function takeReturnPath() {
  try {
    const raw = window.sessionStorage.getItem(KEY)
    if (!raw) return null
    window.sessionStorage.removeItem(KEY)
    const parsed = JSON.parse(raw)
    if (typeof parsed?.path !== 'string' || typeof parsed?.at !== 'number') return null
    if (Date.now() - parsed.at > MAX_AGE_MS) return null
    return parsed.path
  } catch {
    try { window.sessionStorage.removeItem(KEY) } catch { /* ignore */ }
    return null
  }
}

export { KEY as AUTH_RETURN_KEY, MAX_AGE_MS as AUTH_RETURN_MAX_AGE_MS }
