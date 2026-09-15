import { supabase } from './supabase'

/* ════════════════════════════════════════════════════════════════
   GOOGLE CALENDAR — the phone's client over the google-calendar function.
   ════════════════════════════════════════════════════════════════
   Port of apps/web/src/hooks/useGoogleCalendar.js minus the OAuth half.
   Connecting is a redirect to Google and back to a registered web URL,
   so it stays on the web app; everything after that — status, pulling
   new events, disconnecting — is one function call and works as well
   from here. Before this, a coach who only opened the phone never got a
   single new event: the only thing that ever ran `sync` was web's
   calendar screen.

   State lives in a small store rather than per-hook, so the Connections
   card and the calendar screen's background sync read ONE status — a
   manual sync on one updates "last synced" on the other — and it is
   keyed by user id so a sign-out/sign-in on the same phone can never
   show the previous account's connection.
   ════════════════════════════════════════════════════════════════ */

export const SYNC_INTERVAL_MS = 10 * 60_000 // web's cadence

export async function callGoogleCalendar(action, params = {}) {
  const { data, error } = await supabase.functions.invoke('google-calendar', {
    body: { action, ...params },
  })
  if (error) throw error
  if (data && data.error) throw new Error(data.error)
  return data
}

const INITIAL = { userId: null, status: null, loading: false, loaded: false, busy: false, error: null }
let state = INITIAL
const listeners = new Set()
const set = (patch) => { state = { ...state, ...patch }; for (const fn of listeners) fn() }

export function subscribeCalendar(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export function getCalendarState() { return state }
export function resetGoogleCalendar() { state = INITIAL; for (const fn of listeners) fn() }

/* Load the status once per signed-in user. Later calls for the same user
   are no-ops; a different user starts over. */
export function ensureCalendarStatus(userId) {
  if (!userId) return
  if (state.userId === userId && (state.loaded || state.loading)) return
  state = { ...INITIAL, userId, loading: true }
  for (const fn of listeners) fn()
  callGoogleCalendar('status')
    .then((r) => { if (state.userId === userId) set({ status: r?.status ?? null }) })
    .catch((e) => { if (state.userId === userId) set({ error: e?.message || String(e) }) })
    .finally(() => { if (state.userId === userId) set({ loading: false, loaded: true }) })
}

/* Pull new events. Clears the last error first, as web does, so `failing`
   always describes the latest attempt. Throws so callers can react. */
export async function syncCalendar() {
  const userId = state.userId
  set({ busy: true, error: null })
  try {
    const r = await callGoogleCalendar('sync')
    if (state.userId === userId && r?.status) set({ status: r.status })
    return r
  } catch (e) {
    if (state.userId === userId) set({ error: e?.message || String(e) })
    throw e
  } finally {
    if (state.userId === userId) set({ busy: false })
  }
}

export async function disconnectCalendar() {
  const userId = state.userId
  set({ busy: true, error: null })
  try {
    const r = await callGoogleCalendar('disconnect')
    if (state.userId === userId) set({ status: r?.status ?? { connected: false } })
  } catch (e) {
    if (state.userId === userId) set({ error: e?.message || String(e) })
  } finally {
    if (state.userId === userId) set({ busy: false })
  }
}

export function isSyncStale(lastSyncedAt, now = Date.now()) {
  const last = lastSyncedAt ? new Date(lastSyncedAt).getTime() : 0
  return !Number.isFinite(last) || now - last >= SYNC_INTERVAL_MS
}
