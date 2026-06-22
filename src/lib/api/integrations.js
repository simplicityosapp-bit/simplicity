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
export async function callInvoices(action, params = {}) {
  const { data, error } = await supabase.functions.invoke('invoices', {
    body: { action, ...params },
  })
  if (error) throw error
  if (data && data.error) {
    // The coarse code stays the Error message (the UI maps it to Hebrew); any
    // sanitized provider `detail` rides along so the UI can append the real
    // reason a document failed to issue.
    const err = new Error(data.error)
    if (data.detail) err.detail = data.detail
    throw err
  }
  return data
}
