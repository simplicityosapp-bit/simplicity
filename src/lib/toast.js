/* ════════════════════════════════════════════════════════════════
   TOAST — transient success / info confirmations.
   ════════════════════════════════════════════════════════════════
   The "it worked" channel, distinct from the undo store (lib/undo.js):
   adds / edits / payments that previously succeeded SILENTLY now call
   showToast('…') for a brief positive confirmation (no undo button).
   A tiny framework-free pub/sub so any hook or handler can fire one.
   ════════════════════════════════════════════════════════════════ */

export const TOAST_DURATION = 2600

let state = { message: '', seq: 0 }
let timer = null
const listeners = new Set()
const emit = () => { for (const fn of listeners) fn() }

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getSnapshot() {
  return state
}

/* Show a success toast. Replaces any toast currently on screen. */
export function showToast(message) {
  if (!message) return
  if (timer) clearTimeout(timer)
  state = { message, seq: state.seq + 1 }
  emit()
  timer = setTimeout(() => {
    timer = null
    state = { message: '', seq: state.seq + 1 }
    emit()
  }, TOAST_DURATION)
}

/* Dismiss immediately (e.g. a tap on the toast). */
export function clearToast() {
  if (timer) { clearTimeout(timer); timer = null }
  state = { message: '', seq: state.seq + 1 }
  emit()
}
