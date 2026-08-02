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

/* ════════════════════════════════════════════════════════════════
   MODAL STACKING — the last modal to OPEN sits on top. Always.
   ════════════════════════════════════════════════════════════════
   Every modal shares one z-index from Modal.css, so among two open modals the
   winner was decided by DOM order — and portals mount in COMPONENT-MOUNT
   order, not open order, while a closed modal stays mounted. A delete
   confirmation opened from inside the transaction editor therefore landed
   UNDERNEATH it, with both its buttons unreachable: no way to confirm, and no
   way to cancel either (beta 02/08).

   So the layer is handed out on OPEN. Each open modal holds one, and the
   counter resets the moment the last one lets go — the same derive-don't-tally
   discipline as the lock above, and what keeps a long session from drifting up
   into the layers that belong to the tour (1000) and the legal modal (1200).
   Steps of 20 keep each modal's overlay above the sheet below it. */
const layers = new Map()
let nextLayer = 0

export function acquireModalLayer() {
  const token = {}
  const layer = nextLayer++
  layers.set(token, layer)
  return {
    layer,
    release: () => {
      layers.delete(token)
      if (layers.size === 0) nextLayer = 0
    },
  }
}

/* True when no open modal sits above this one — used so a single Escape closes
   only the top dialog, and so the check no longer depends on DOM order. */
export function isTopModalLayer(layer) {
  for (const other of layers.values()) if (other > layer) return false
  return true
}

/* Called on every route change. If no modal is actually on screen, any lock
   still held is a leak — and this is where it ends. Navigation is what a stuck
   user reaches for, and the nav bars sit outside .screen, so they still respond
   while the screen itself is frozen. */
export function reconcileModalLock() {
  if (typeof document === 'undefined') return
  if (document.querySelector('.m-sheet.open')) return
  openModals.clear()
  layers.clear()
  nextLayer = 0
  document.body.classList.remove('modal-open')
}
