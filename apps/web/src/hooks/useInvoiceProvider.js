import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { callInvoices } from '../lib/api/integrations'

/* Client over the `invoices` edge function. Unlike Google Calendar there is
   no OAuth redirect — the user pastes their provider API key + secret and we
   POST them to the function, which validates by minting a token server-side.
   Status never includes the key/secret (the browser can't read them at all).

   Status + catalog are read through React Query so they're fetched ONCE and
   shared across every mount: InvoiceCard (connections) and every InvoiceActions
   instance (one per edit-transaction modal) read the same cached status instead
   of each firing its own round-trip. Connect/test/disconnect/auto-import write
   the fresh status straight back into the cache, so a just-connected provider
   immediately enables "הפק חשבונית" everywhere. */
const STATUS_KEY = ['invoice_status']
const CATALOG_KEY = ['invoice_catalog']

export function useInvoiceProvider() {
  const qc = useQueryClient()
  const { data: status = null, isLoading: loading, error: queryError } = useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => callInvoices('status').then((r) => r.status),
  })
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const setStatus = useCallback((s) => qc.setQueryData(STATUS_KEY, s), [qc])

  const loadStatus = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: STATUS_KEY })
  }, [qc])

  /* Connect (and validate) a provider. creds: { provider, apiKey, apiSecret,
     environment }. Throws on failure (the caller shows the mapped message). */
  const connect = useCallback(async ({ provider, apiKey, apiSecret, environment }) => {
    setBusy(true); setActionError(null)
    try {
      const r = await callInvoices('connect', {
        provider,
        api_key: apiKey,
        api_secret: apiSecret,
        environment,
      })
      setStatus(r.status)
      qc.removeQueries({ queryKey: CATALOG_KEY }) // new connection → its catalog may differ
      return r
    } catch (e) {
      setActionError(e.message); throw e
    } finally {
      setBusy(false)
    }
  }, [qc, setStatus])

  /* Re-validate the stored credentials (mints a fresh token server-side). */
  const test = useCallback(async () => {
    setBusy(true); setActionError(null)
    try {
      const r = await callInvoices('test')
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
      const r = await callInvoices('disconnect')
      setStatus(r.status)
      qc.removeQueries({ queryKey: CATALOG_KEY })
    } catch (e) {
      setActionError(e.message); throw e // let the caller surface the failure
    } finally {
      setBusy(false)
    }
  }, [qc, setStatus])

  /* Issue a real document for an income transaction. Returns { document }.
     The caller (InvoiceActions) tracks its own busy/error state. */
  const issueDocument = useCallback(async (transactionId, docType, opts = {}) => {
    return callInvoices('issue', {
      transaction_id: transactionId,
      doc_type: docType,
      item_name: opts.itemName,
      item_id: opts.itemId,
      payment_method: opts.paymentMethod,
    })
  }, [])

  /* Issue a credit note that cancels a previously-issued document. Returns
     { document }. The caller (InvoiceActions) tracks its own busy/error. */
  const creditDocument = useCallback(async (transactionId, reason) => {
    return callInvoices('credit', { transaction_id: transactionId, reason })
  }, [])

  /* ── Repairing a transaction left in doubt ────────────────────────────
     An issuance whose outcome could not be determined leaves the claim in
     place on purpose, because retrying could mint a second real tax document.
     These three resolve that state; all are user-initiated, never automatic. */

  /* Ask the provider what it actually created around the failed attempt — the
     only way to learn the internal document id (the running number the user
     can see is NOT it). One billed API call per click, so call it on an
     explicit action and never on render or a timer. */
  const issueCandidates = useCallback(async (transactionId) => {
    const r = await callInvoices('issue-candidates', { transaction_id: transactionId })
    return r?.candidates ?? []
  }, [])

  /* "There is no document" — release the claim so issuing can be retried. */
  const clearIssueClaim = useCallback(async (transactionId) => {
    return callInvoices('issue-clear', { transaction_id: transactionId })
  }, [])

  /* "This is the document" — attach one the provider confirmed exists. */
  const linkIssuedDocument = useCallback(async (transactionId, doc) => {
    return callInvoices('issue-link', {
      transaction_id: transactionId,
      document_id: doc.id,
      document_number: doc.number,
      document_type: doc.type,
      document_url: doc.url,
    })
  }, [])

  /* The connected provider's product/service catalog (for the issuance picker),
     cached for the session — re-opening the picker (same or another transaction)
     resolves from cache instead of re-fetching every time. */
  const loadItems = useCallback(() => qc.fetchQuery({
    queryKey: CATALOG_KEY,
    queryFn: () => callInvoices('catalog').then((r) => r?.items ?? []),
  }), [qc])

  /* Toggle auto-import (Route B: stage vs. record incoming docs without asking). */
  const setAutoImport = useCallback(async (value) => {
    setBusy(true); setActionError(null)
    try {
      const r = await callInvoices('set-auto-import', { value: !!value })
      if (r?.status) setStatus(r.status)
      return r
    } catch (e) {
      setActionError(e.message); throw e
    } finally {
      setBusy(false)
    }
  }, [setStatus])

  /* Toggle the opt-in periodic (daily) scan. Independent of the real-time
     webhook — ON means the cron calls the provider's documents-list API once
     a day (the card warns about possible per-call API charges first). */
  const setScheduledScan = useCallback(async (value) => {
    setBusy(true); setActionError(null)
    try {
      const r = await callInvoices('set-scheduled-scan', { value: !!value })
      if (r?.status) setStatus(r.status)
      return r
    } catch (e) {
      setActionError(e.message); throw e
    } finally {
      setBusy(false)
    }
  }, [setStatus])

  /* Set the business type ('exempt' עוסק פטור / 'licensed' עוסק מורשה) — drives
     the issue doc-type picker. Confirmed by the user (no accidental change). */
  const setBusinessType = useCallback(async (value) => {
    setBusy(true); setActionError(null)
    try {
      const r = await callInvoices('set-business-type', { value })
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
    issueDocument,
    creditDocument,
    issueCandidates,
    clearIssueClaim,
    linkIssuedDocument,
    loadItems,
    setAutoImport,
    setScheduledScan,
    setBusinessType,
  }
}
