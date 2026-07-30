/* ════════════════════════════════════════════════════════════════
   LEAVE GUARD — "you have unsaved work" for in-app navigation.
   ════════════════════════════════════════════════════════════════
   `beforeunload` covers a browser refresh / tab close, but it never fires on a
   route change inside a single-page app — so a screen holding unsaved work (the
   page builder) lost it the moment someone tapped the sidebar or the bottom bar,
   with no warning at all.

   React Router's own `useBlocker` is not an option here: it requires a DATA
   router (createBrowserRouter), and the app mounts a plain <BrowserRouter>.
   So the app chrome asks this module instead — one line per navigation site.

   A screen registers a guard while it is dirty and clears it when it is clean
   or unmounts. With nothing registered `confirmLeave()` is simply true, so
   navigation is untouched everywhere else in the app.

   The call is synchronous — a click handler has to decide right there whether to
   navigate — but the ANSWER doesn't have to be. A guard gets the navigation as a
   `retry` callback: it can block now (return false), ask in the app's own modal,
   and run `retry()` once the user says yes. That keeps the question inside the
   product's language instead of a browser dialog that ignores RTL. */

let guard = null

/* Register the "may I leave?" question. Only one screen can hold it — the app
   never has two editors open at once. Pair every call with clearLeaveGuard. */
export function setLeaveGuard(fn) {
  guard = fn
}

/* Clear it, but only if it is still OURS — a screen unmounting late must not
   wipe a guard that a newly-mounted screen has already installed. */
export function clearLeaveGuard(fn) {
  if (guard === fn) guard = null
}

/* True = navigate now. False = the guard has taken over and will call `retry`
   itself if the user confirms. Nothing registered = always go.
   A guard that throws must never trap the user on the screen, so it fails open. */
export function confirmLeave(retry) {
  if (!guard) return true
  try {
    return guard(retry) !== false
  } catch {
    return true
  }
}
