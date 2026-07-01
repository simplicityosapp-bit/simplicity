import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { callGrow } from '../lib/api/integrations'
import { GROW_ENABLED } from '../lib/grow'

/* Client over the `grow` edge function — the Grow (גרו / Meshulam) payment
   gateway. Like the invoice provider (and unlike Google Calendar) there is no
   OAuth redirect: the user pastes their Grow userId + pageCode + apiKey and we
   POST them to the function, which validates them server-side. Status never
   includes any of the three (the browser can't read them at all).

   Status is read through React Query so it's fetched ONCE and shared across
   every mount (the connections row + the GrowCard). connect/test/disconnect
   write the fresh status straight back into the cache, so a just-connected
   gateway lights up everywhere immediately. */
const STATUS_KEY = ['grow_status']

export function useGrowGateway() {
  const qc = useQueryClient()
  const { data: status = null, isLoading: loading, error: queryError } = useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => callGrow('status').then((r) => r.status),
    // Feature locked → make NO network call; the gateway reports "not
    // connected", which hides every downstream payment-link button.
    enabled: GROW_ENABLED,
  })
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const setStatus = useCallback((s) => qc.setQueryData(STATUS_KEY, s), [qc])

  const loadStatus = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: STATUS_KEY })
  }, [qc])

  /* Connect (and validate) the gateway. creds: { userId, pageCode, apiKey,
     environment }. Throws on failure (the caller shows the mapped message). */
  const connect = useCallback(async ({ userId, pageCode, apiKey, environment }) => {
    setBusy(true); setActionError(null)
    try {
      const r = await callGrow('connect', { userId, pageCode, apiKey, environment })
      setStatus(r.status)
      return r
    } catch (e) {
      setActionError(e.message); throw e
    } finally {
      setBusy(false)
    }
  }, [setStatus])

  /* Re-validate the stored credentials (a real round-trip to Grow). */
  const test = useCallback(async () => {
    setBusy(true); setActionError(null)
    try {
      const r = await callGrow('test')
      if (r.status) setStatus(r.status)
      return r
    } catch (e) {
      setActionError(e.message); throw e
    } finally {
      setBusy(false)
    }
  }, [setStatus])

  const disconnect = useCallback(async () => {
    setBusy(true); setActionError(null)
    try {
      const r = await callGrow('disconnect')
      setStatus(r.status)
    } catch (e) {
      setActionError(e.message); throw e
    } finally {
      setBusy(false)
    }
  }, [setStatus])

  /* Create a Grow payment link for a balance / transaction / installment.
     Returns { payment: { id, url } }. The income is recorded server-side by the
     grow-webhook when the customer actually pays — never here. The caller
     tracks its own busy/error state. */
  const createPaymentLink = useCallback(async ({ source, clientId, transactionId, installmentId, amount, description }) => {
    return callGrow('create-payment-link', {
      source,
      client_id: clientId,
      transaction_id: transactionId,
      installment_id: installmentId,
      amount,
      description,
      return_origin: typeof window !== 'undefined' ? window.location.origin : '',
    })
  }, [])

  /* Toggle auto-issuing a receipt via the connected invoice provider on a Grow
     payment (opt-in). Writes the fresh status straight back to the cache. */
  const setAutoReceipt = useCallback(async (value) => {
    setBusy(true); setActionError(null)
    try {
      const r = await callGrow('set-auto-receipt', { value: !!value })
      if (r?.status) setStatus(r.status)
      return r
    } catch (e) {
      setActionError(e.message); throw e
    } finally {
      setBusy(false)
    }
  }, [setStatus])

  /* Toggle polling-import of external Grow charges (opt-in). Charges are staged
     as pending imports (grow-poll) for the coach to approve. */
  const setImport = useCallback(async (value) => {
    setBusy(true); setActionError(null)
    try {
      const r = await callGrow('set-import', { value: !!value })
      if (r?.status) setStatus(r.status)
      return r
    } catch (e) {
      setActionError(e.message); throw e
    } finally {
      setBusy(false)
    }
  }, [setStatus])

  return {
    status,
    loading,
    busy,
    error: actionError ?? (queryError?.message ?? null),
    connect,
    test,
    disconnect,
    loadStatus,
    createPaymentLink,
    setAutoReceipt,
    setImport,
  }
}
