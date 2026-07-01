import { useCallback, useEffect, useState } from 'react'
import { callGoogleCalendar } from '../lib/api/integrations'
import { ROUTES } from '../lib/routes'

/* Client over the google-calendar edge function. The OAuth flow is a
   full-page redirect: beginConnect() asks the function for the Google
   consent URL and navigates there; on return the connections screen
   calls completeConnect(code). Status never includes tokens. */
const REDIRECT_PATH = ROUTES.CONNECTIONS
const SYNC_FROM_KEY = 'gcal_sync_from'
const OAUTH_STATE_KEY = 'gcal_oauth_state' // CSRF nonce, stored before redirect

export function useGoogleCalendar() {
  const [status, setStatus] = useState(null) // { connected, sync_from, last_synced_at }
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  /* Initial status — state only set in the async continuation (so the
     effect never calls setState synchronously). */
  useEffect(() => {
    let active = true
    callGoogleCalendar('status')
      .then((r) => { if (active) setStatus(r.status) })
      .catch((e) => { if (active) setError(e.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const r = await callGoogleCalendar('status')
      setStatus(r.status)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const beginConnect = useCallback(async (syncFrom) => {
    setBusy(true); setError(null)
    try {
      const redirect_uri = window.location.origin + REDIRECT_PATH
      sessionStorage.setItem(SYNC_FROM_KEY, syncFrom || '')
      /* CSRF nonce: generated + stored HERE, echoed by Google via `state`, and
         verified on return (completeConnect) so an attacker-supplied ?code= can't
         be redeemed into this account. */
      const state = crypto.randomUUID()
      sessionStorage.setItem(OAUTH_STATE_KEY, state)
      const { url } = await callGoogleCalendar('auth-url', { redirect_uri, state })
      window.location.href = url /* leaves the SPA → Google consent */
    } catch (e) {
      setError(e.message); setBusy(false)
    }
  }, [])

  const completeConnect = useCallback(async (code, returnedState) => {
    setBusy(true); setError(null)
    try {
      /* CSRF guard: only redeem the code if the `state` Google echoed back
         matches the nonce this device stored before the redirect. Blocks an
         attacker who lures a logged-in user to /connections?code=<their_code>. */
      const expected = sessionStorage.getItem(OAUTH_STATE_KEY)
      if (!expected || !returnedState || returnedState !== expected) {
        throw new Error('oauth state mismatch')
      }
      const redirect_uri = window.location.origin + REDIRECT_PATH
      const sync_from = sessionStorage.getItem(SYNC_FROM_KEY) || undefined
      const r = await callGoogleCalendar('connect', { code, redirect_uri, sync_from })
      setStatus(r.status)
      return r
    } catch (e) {
      setError(e.message); throw e
    } finally {
      setBusy(false)
      // Always clear the one-shot flow state — even on cancel/error — so no
      // stale nonce or sync_from lingers for the rest of the tab's lifetime.
      sessionStorage.removeItem(SYNC_FROM_KEY)
      sessionStorage.removeItem(OAUTH_STATE_KEY)
    }
  }, [])

  const sync = useCallback(async () => {
    setBusy(true); setError(null)
    try {
      const r = await callGoogleCalendar('sync')
      setStatus(r.status)
      return r
    } catch (e) {
      setError(e.message); throw e
    } finally {
      setBusy(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    setBusy(true); setError(null)
    try {
      const r = await callGoogleCalendar('disconnect')
      setStatus(r.status)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }, [])

  return { status, loading, busy, error, beginConnect, completeConnect, sync, disconnect, loadStatus }
}
