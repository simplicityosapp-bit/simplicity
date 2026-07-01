/* ════════════════════════════════════════════════════════════════
   UNDO STORE — single-level undo + redo for destructive actions.
   ════════════════════════════════════════════════════════════════
   A tiny framework-free pub/sub store so ANY hook can register an
   undoable action (pushUndo) without prop-drilling a context. The
   <UndoToast> subscribes for rendering; a global keyboard listener
   (Ctrl/Cmd+Z, Ctrl/Cmd+Y) drives undo/redo on desktop.

   Scope (per product decision): the most-recent destructive action
   only — deletions and status changes. Undo is offered while the
   toast is alive (~6s); after it expires the row is still recoverable
   from the Trash drawer (everything is a soft delete).

   An action is { label, undo, redo }:
     • undo() reverses the action (restore the row / put the old value
       back). Called by Ctrl+Z, the "בטל" button, or a tap on mobile.
     • redo() re-applies it. Called by Ctrl+Y after an undo.
   Both should be idempotent-ish and never throw fatally — the store
   swallows errors so a failed network call can't wedge the UI; the
   Trash drawer remains the safety net.
   ════════════════════════════════════════════════════════════════ */

import i18n from '../i18n'

const OFFER_MS = 6000   /* how long "בטל" is offered after an action */
const UNDONE_MS = 3500  /* brief confirm window after undo (redo lives here) */

/* Public, render-facing snapshot. `seq` bumps on every transition so
   the toast can re-key its countdown bar to restart the CSS animation. */
let state = { phase: 'idle', label: '', duration: 0, seq: 0 }

let pending = null   /* { label, undo, redo } — undoable while phase==='offer' */
let redoable = null  /* { label, undo, redo } — redoable while phase==='undone' */
let timer = null

const listeners = new Set()
const emit = () => { for (const fn of listeners) fn() }
const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null } }

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getSnapshot() {
  return state
}

function expire() {
  clearTimer()
  pending = null
  redoable = null
  state = { phase: 'idle', label: '', duration: 0, seq: state.seq + 1 }
  emit()
}

/* Register a freshly-performed destructive action. Replaces any action
   currently on offer (single-level) — the old one stays done and is
   still recoverable from Trash. */
export function pushUndo({ label, undo, redo }) {
  clearTimer()
  pending = { label, undo, redo }
  redoable = null
  state = { phase: 'offer', label, duration: OFFER_MS, seq: state.seq + 1 }
  timer = setTimeout(expire, OFFER_MS)
  emit()
}

export async function performUndo() {
  if (state.phase !== 'offer' || !pending) return
  clearTimer()
  const action = pending
  pending = null
  redoable = action
  state = { phase: 'undone', label: i18n.t('components:undo.undone'), duration: UNDONE_MS, seq: state.seq + 1 }
  timer = setTimeout(expire, UNDONE_MS)
  emit()
  try { await action.undo() } catch { /* best-effort; Trash remains the fallback */ }
}

export async function performRedo() {
  if (state.phase !== 'undone' || !redoable) return
  clearTimer()
  const action = redoable
  redoable = null
  pending = action
  state = { phase: 'offer', label: action.label, duration: OFFER_MS, seq: state.seq + 1 }
  timer = setTimeout(expire, OFFER_MS)
  emit()
  try { await action.redo() } catch { /* best-effort */ }
}

/* User dismissed the toast (the small X). Drops the offer — no undo. */
export function dismiss() {
  expire()
}
