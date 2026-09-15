/* ════════════════════════════════════════════════════════════════
   TOAST — transient success / error confirmations.
   ════════════════════════════════════════════════════════════════
   Port of apps/web/src/lib/toast.js, and deliberately the same shape:
   the "it worked" channel, distinct from the undo store (lib/undo.js),
   which only speaks when there is something to take back. A framework-
   free pub/sub so a hook, a handler or a background sync can fire one
   without threading a callback down to wherever the host is mounted.
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

export function showError(message) { showToast(message, 'error') }

/* Dismiss immediately (a tap on the toast). */
export function clearToast() {
  if (timer) { clearTimeout(timer); timer = null }
  state = { message: '', type: 'success', seq: state.seq + 1 }
  emit()
}
