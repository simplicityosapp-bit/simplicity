/* ════════════════════════════════════════════════════════════════
   TOAST — transient success / info confirmations.
   ════════════════════════════════════════════════════════════════
   The "it worked" channel, distinct from the undo store (lib/undo.js):
   adds / edits / payments that previously succeeded SILENTLY now call
   showToast('…') for a brief positive confirmation (no undo button).
   A tiny framework-free pub/sub so any hook or handler can fire one.
   ════════════════════════════════════════════════════════════════ */

export const TOAST_DURATION = 2600

let state = { message: '', type: 'success', seq: 0 }
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

/* Show a toast (type 'success' | 'error'). Replaces any toast on screen.
   Errors linger a touch longer so they're not missed. */
export function showToast(message, type = 'success') {
  if (!message) return
  if (timer) clearTimeout(timer)
  state = { message, type, seq: state.seq + 1 }
  emit()
  timer = setTimeout(() => {
    timer = null
    state = { message: '', type: 'success', seq: state.seq + 1 }
    emit()
  }, type === 'error' ? TOAST_DURATION + 1400 : TOAST_DURATION)
}

/* Convenience for the silent-failure path (optimistic update reverted). */
export function showError(message) { showToast(message, 'error') }

/* Dismiss immediately (e.g. a tap on the toast). */
export function clearToast() {
  if (timer) { clearTimeout(timer); timer = null }
  state = { message: '', seq: state.seq + 1 }
  emit()
}
