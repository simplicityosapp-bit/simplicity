import { useCallback, useEffect, useState } from 'react'
import { callInvoices } from '../lib/api/integrations'

/* Client over the `invoices` edge function. Unlike Google Calendar there is
   no OAuth redirect — the user pastes their provider API key + secret and we
   POST them to the function, which validates by minting a token server-side.
   Status never includes the key/secret (the browser can't read them at all). */
export function useInvoiceProvider() {
  const [status, setStatus] = useState(null) // { connected, provider, environment, connected_at, auto_import }
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  /* Initial status — state only set in the async continuation (so the effect
     never calls setState synchronously). */
  useEffect(() => {
    let active = true
    callInvoices('status')
      .then((r) => { if (active) setStatus(r.status) })
      .catch((e) => { if (active) setError(e.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const r = await callInvoices('status')
      setStatus(r.status)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  /* Connect (and validate) a provider. creds: { provider, apiKey, apiSecret,
     environment }. Throws on failure (the caller shows the mapped message). */
  const connect = useCallback(async ({ provider, apiKey, apiSecret, environment }) => {
    setBusy(true); setError(null)
    try {
      const r = await callInvoices('connect', {
        provider,
        api_key: apiKey,
        api_secret: apiSecret,
        environment,
      })
      setStatus(r.status)
      return r
    } catch (e) {
      setError(e.message); throw e
    } finally {
      setBusy(false)
    }
  }, [])

  /* Re-validate the stored credentials (mints a fresh token server-side). */
  const test = useCallback(async () => {
    setBusy(true); setError(null)
    try {
      const r = await callInvoices('test')
      if (r.status) setStatus(r.status)
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
      const r = await callInvoices('disconnect')
      setStatus(r.status)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }, [])

  return { status, loading, busy, error, connect, test, disconnect, loadStatus }
}
