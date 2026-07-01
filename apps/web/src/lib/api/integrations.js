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

/* Thin clients over the `invoices` (Green Invoice / SUMIT) and `grow` (Grow /
   Meshulam payment gateway) edge functions. Credentials are entered by the user
   and travel straight to the service-role function — the browser never reads
   them back. Thrown errors carry the function's coarse code (e.g.
   'invalid_credentials') as message, which the UI maps to a sentence. */
/* Build the thrown Error from a function response body: the coarse code stays
   the Error message (the UI maps it to a sentence); any sanitized provider
   `detail` rides along so the UI can append the real reason a call failed. */
function fnError(body) {
  const err = new Error(body.error)
  if (body.detail) err.detail = body.detail
  return err
}

/* supabase-js throws a FunctionsHttpError for ANY non-2xx response, so our
   { error, detail } body never lands in `data` — it's on error.context (the
   raw Response). Read it out so the UI shows the real code + provider reason
   instead of a generic "request failed". Returns the parsed body, or null. */
async function readFnErrorBody(error) {
  const ctx = error.context
  if (ctx && typeof ctx.json === 'function') {
    // Clone before reading: if supabase-js (or a future version) already
    // consumed the Response stream, a bare .json() throws "body already read"
    // and we'd lose the real code + detail. Clone (when possible) avoids that.
    const src = (typeof ctx.clone === 'function' && !ctx.bodyUsed) ? ctx.clone() : ctx
    try { return await src.json() } catch { /* not JSON / already read */ return null }
  }
  if (ctx && typeof ctx === 'object') return ctx // some versions hand back an already-parsed body
  return null
}

export async function callInvoices(action, params = {}) {
  const { data, error } = await supabase.functions.invoke('invoices', {
    body: { action, ...params },
  })
  if (error) {
    const body = await readFnErrorBody(error)
    if (body && body.error) throw fnError(body)
    throw error
  }
  if (data && data.error) throw fnError(data)
  return data
}

/* Thin client over the `grow` edge function (Grow / Meshulam payment gateway).
   Same error-shape handling as callInvoices. */
export async function callGrow(action, params = {}) {
  const { data, error } = await supabase.functions.invoke('grow', {
    body: { action, ...params },
  })
  if (error) {
    const body = await readFnErrorBody(error)
    if (body && body.error) throw fnError(body)
    throw error
  }
  if (data && data.error) throw fnError(data)
  return data
}
