import { lazy } from 'react'

/* Screens are code-split: each is fetched on demand via a dynamic import().
   Two things make that import reject and — left unhandled — blank the whole
   app (React unmounts the tree when a render throws):

     1. Stale chunk after a deploy. A tab opened before a new build still
        points at the old hashed filename, which 404s once the new build is
        live. This is the single most common cause of "entering a screen
        shows a blank page."
     2. A transient network blip while fetching the chunk.

   This wrapper retries once (covers blips), then forces a single hard reload
   to pull the fresh asset manifest (covers stale chunks). A sessionStorage
   guard prevents an infinite reload loop when the asset is genuinely gone;
   any healthy load clears the guard so a later deploy can self-heal again. */

const RELOAD_GUARD = 'mg-chunk-reloaded'

function readGuard() {
  try { return !!sessionStorage.getItem(RELOAD_GUARD) } catch { return false }
}

/* Exposed so the ErrorBoundary shares the same one-reload budget — a chunk
   error that slips past this retry must not trigger a second reload. */
export function hasReloadGuard() { return readGuard() }
export function markReloadGuard() {
  try { sessionStorage.setItem(RELOAD_GUARD, '1') } catch { /* private mode */ }
}
function clearGuard() {
  try { sessionStorage.removeItem(RELOAD_GUARD) } catch { /* private mode */ }
}

export default function lazyWithRetry(importFn) {
  return lazy(async () => {
    try {
      const mod = await importFn()
      clearGuard() // healthy load → reset the budget for future deploys
      return mod
    } catch {
      // One quiet retry for a transient blip — no visible disruption.
      try {
        await new Promise((resolve) => setTimeout(resolve, 600))
        const mod = await importFn()
        clearGuard()
        return mod
      } catch (err) {
        // Still failing: almost certainly a stale chunk. Reload ONCE to
        // fetch the new manifest; return a never-resolving promise so the
        // heart splash stays up until the reload takes over (never blank).
        if (!readGuard()) {
          markReloadGuard()
          window.location.reload()
          return new Promise(() => {})
        }
        // Already reloaded and still broken → let the ErrorBoundary show
        // the branded retry screen instead of a blank page.
        throw err
      }
    }
  })
}
