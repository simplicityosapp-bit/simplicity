import { supabase } from './supabase'
import i18n from './i18n'

/* ════════════════════════════════════════════════════════════════
   INVOICES — the phone's client over the `invoices` edge function.
   ════════════════════════════════════════════════════════════════
   Port of web's callInvoices (lib/api/integrations.js) and the calls
   useInvoiceProvider makes. Connecting a provider (pasting its API key)
   stays on the web app; everything a coach does day to day — issuing a
   receipt, crediting it, repairing an issuance that never resolved,
   approving imported documents — is one function call and works here.

   Errors: supabase-js throws a FunctionsHttpError for any non-2xx, and our
   { error, detail, outcome_unknown } body sits on error.context (the raw
   Response). It is read out so the thrown Error carries the function's
   coarse code as its message, the provider's reason as .detail, and
   .outcomeUnknown when the server kept the claim because it could not tell
   whether a document was created — the one case where a retry could mint a
   duplicate real tax document.

   Status and the product catalog are fetched once per signed-in user and
   shared by every mount, like web's React Query cache.
   ════════════════════════════════════════════════════════════════ */

function fnError(body) {
  const err = new Error(body.error)
  if (body.detail) err.detail = body.detail
  if (body.outcome_unknown) err.outcomeUnknown = true
  return err
}

async function readFnErrorBody(error) {
  const ctx = error?.context
  if (ctx && typeof ctx.json === 'function') {
    const src = (typeof ctx.clone === 'function' && !ctx.bodyUsed) ? ctx.clone() : ctx
    try { return await src.json() } catch { return null }
  }
  if (ctx && typeof ctx === 'object') return ctx
  return null
}

export async function callInvoices(action, params = {}) {
  const { data, error } = await supabase.functions.invoke('invoices', { body: { action, ...params } })
  if (error) {
    const body = await readFnErrorBody(error)
    if (body && body.error) throw fnError(body)
    throw error
  }
  if (data && data.error) throw fnError(data)
  return data
}

// ── shared status ───────────────────────────────────────────────────────────
const INITIAL = { userId: undefined, status: null, loaded: false }
let state = INITIAL
let inflight = null
let catalog = null
const listeners = new Set()
const set = (next) => { state = next; for (const fn of listeners) fn() }

export function subscribeInvoiceStatus(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export function getInvoiceStatusSnapshot() { return state }

export async function loadInvoiceStatus({ force = false } = {}) {
  let uid = null
  try { uid = (await supabase.auth.getSession())?.data?.session?.user?.id || null } catch { /* signed out */ }
  // A different account on the same phone never sees the previous one's connection.
  if (state.userId !== uid) { set({ ...INITIAL, userId: uid }); catalog = null; inflight = null }
  if (state.loaded && !force) return state.status
  if (inflight && !force) return inflight
  inflight = callInvoices('status')
    .then((r) => { set({ userId: uid, status: r?.status || null, loaded: true }); return state.status })
    .catch(() => { set({ userId: uid, status: null, loaded: true }); return null })
    .finally(() => { inflight = null })
  return inflight
}

export function resetInvoiceCache() { state = INITIAL; inflight = null; catalog = null; for (const fn of listeners) fn() }

// The provider's product/service catalog, cached for the session.
export function loadInvoiceCatalog() {
  if (!catalog) {
    catalog = callInvoices('catalog').then((r) => r?.items ?? []).catch((e) => { catalog = null; throw e })
  }
  return catalog
}

// ── actions ─────────────────────────────────────────────────────────────────
export const issueDocument = (transactionId, docType, { itemId = null, itemName = '', paymentMethod } = {}) =>
  callInvoices('issue', { transaction_id: transactionId, doc_type: docType, item_name: itemName, item_id: itemId, payment_method: paymentMethod })
export const creditDocument = (transactionId, reason) => callInvoices('credit', { transaction_id: transactionId, reason })
/* One billed provider call — only ever on an explicit tap. */
export const issueCandidates = async (transactionId) => (await callInvoices('issue-candidates', { transaction_id: transactionId }))?.candidates ?? []
export const clearIssueClaim = (transactionId) => callInvoices('issue-clear', { transaction_id: transactionId })
export const linkIssuedDocument = (transactionId, doc) => callInvoices('issue-link', {
  transaction_id: transactionId, document_id: doc.id, document_number: doc.number, document_type: doc.type, document_url: doc.url,
})

// ── errors → sentences (web InvoiceActions errMsg / errMsgWithDetail) ────────
const ERR_KEY = {
  already_issued: 'alreadyIssued',
  already_credited: 'alreadyCredited',
  not_issued: 'notIssued',
  no_client: 'noClient',
  doctype_for_business: 'docTypeForBusiness',
  not_connected: 'notConnected',
  not_income: 'notIncome',
  bad_amount: 'badAmount',
  transaction_not_found: 'transactionNotFound',
  not_in_doubt: 'notInDoubt',
  document_already_linked: 'documentAlreadyLinked',
  invalid_credentials: 'invalidCredentials',
  provider_unreachable: 'providerUnreachable',
  provider_error: 'providerError',
}

export function invoiceErrorMessage(e) {
  const t = (k, o) => i18n.t(`connections:actions.err.${k}`, o)
  // Provider code 2403: the document type is not allowed for this business type.
  if (e?.detail && /\b2403\b/.test(e.detail)) return t('docTypeForBusiness')
  const key = ERR_KEY[e?.message] || 'generic'
  const base = key === 'providerUnreachable' || key === 'generic' ? t(key, { retry: t('retry') }) : t(key)
  return e?.detail ? `${base} (${e.detail})` : base
}
