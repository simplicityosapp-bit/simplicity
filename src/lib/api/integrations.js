/* ════════════════════════════════════════════════════════════════
   INTEGRATIONS API — thin client over the `google-calendar` edge
   function. All OAuth/token work is server-side; the browser only ever
   sends an action and gets back non-secret status (+ synced counts).
   ════════════════════════════════════════════════════════════════ */

import { supabase } from '../supabase'

export async function callGoogleCalendar(action, params = {}) {
  const { data, error } = await supabase.functions.invoke('google-calendar', {
    body: { action, ...params },
  })
  if (error) throw error
  if (data && data.error) throw new Error(data.error)
  return data
}

/* Thin client over the `invoices` edge function (Green Invoice / SUMIT).
   The API key + secret are entered by the user and travel straight to the
   service-role function — the browser never reads them back. Thrown errors
   carry the function's coarse code (e.g. 'invalid_credentials') as message,
   which the UI maps to a Hebrew sentence. */
/* Build the thrown Error from a function response body: the coarse code stays
   the Error message (the UI maps it to Hebrew); any sanitized provider `detail`
   rides along so the UI can append the real reason a document failed to issue. */
function invoiceError(body) {
  const err = new Error(body.error)
  if (body.detail) err.detail = body.detail
  return err
}

export async function callInvoices(action, params = {}) {
  const { data, error } = await supabase.functions.invoke('invoices', {
    body: { action, ...params },
  })
  if (error) {
    // supabase-js throws a FunctionsHttpError for ANY non-2xx response, so our
    // { error, detail } body never lands in `data` — it's on error.context (the
    // raw Response). Read it out so the UI shows the real code + provider reason
    // instead of a generic "request failed".
    let body = null
    const ctx = error.context
    if (ctx && typeof ctx.json === 'function') {
      try { body = await ctx.json() } catch { /* not JSON — fall through */ }
    } else if (ctx && typeof ctx === 'object') {
      body = ctx // some versions hand back an already-parsed body
    }
    if (body && body.error) throw invoiceError(body)
    throw error
  }
  if (data && data.error) throw invoiceError(data)
  return data
}
