/* ════════════════════════════════════════════════════════════════
   MODAL SCROLL LOCK — the one thing that can stop a screen scrolling.
   ════════════════════════════════════════════════════════════════
   `body.modal-open .screen { overflow: hidden }` (index.css) freezes the
   scrolling screen behind an open modal so touch scrolling cannot bleed
   through. Stacked modals — a ConfirmModal over a form modal — mean the lock
   can only lift when the LAST one closes.

   That used to be a running tally, and a tally is a bad way to decide this: it
   has to stay perfectly balanced forever, and if it ever drifts up by one the
   app is left with a screen that will not scroll and no way back. Nothing looks
   broken, so there is nothing to press to fix it.

   So the class is DERIVED, never incremented. Each open modal holds a token;
   the class is recomputed from how many tokens exist. A double-release is
   harmless, and `reconcileModalLock` gives any leak a guaranteed death on the
   next route change — with the DOM, not the bookkeeping, as the final word on
   whether a modal is really on screen.

   Lives outside Modal.jsx because a component file may only export components
   if react-refresh is to keep working. */

const openModals = new Set()

const sync = () => {
  document.body.classList.toggle('modal-open', openModals.size > 0)
}

/* Claim the lock for one open modal. Returns the release function. */
export function acquireModalLock() {
  const token = {}
  openModals.add(token)
  sync()
  return () => {
    openModals.delete(token)
    sync()
  }
}

/* Called on every route change. If no modal is actually on screen, any lock
   still held is a leak — and this is where it ends. Navigation is what a stuck
   user reaches for, and the nav bars sit outside .screen, so they still respond
   while the screen itself is frozen. */
export function reconcileModalLock() {
  if (typeof document === 'undefined') return
  if (document.querySelector('.m-sheet.open')) return
  openModals.clear()
  document.body.classList.remove('modal-open')
}
