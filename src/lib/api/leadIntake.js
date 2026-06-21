/* ════════════════════════════════════════════════════════════════
   LEAD INTAKE — public client for the `lead-intake` edge function.
   ════════════════════════════════════════════════════════════════
   Used by the public lead page (/lead/<id>), reachable WITHOUT login.
   The edge function holds the service role; this client only carries
   the anon key (attached automatically by supabase.functions.invoke).
   It is the ONLY path the public page uses to read a page config or
   submit a lead — the lead_pages / leads tables are never touched
   directly from the browser here. */

import { supabase } from '../supabase'

/* Fetch a published page's public config. Throws 'not_found' when the
   page is missing / unpublished / deleted. */
export async function fetchLeadPageConfig(pageId) {
  const { data, error } = await supabase.functions.invoke(
    `lead-intake?page=${encodeURIComponent(pageId)}`,
    { method: 'GET' },
  )
  if (error) {
    // invoke surfaces non-2xx as an error; treat a 404 as a clean not-found.
    throw new Error('not_found')
  }
  return data
}

/* Submit a filled form. `answers` is a flat { key: value } map. Returns
   { ok, thankYou }. Throws on network / validation failure. */
export async function submitLead(pageId, answers) {
  const { data, error } = await supabase.functions.invoke('lead-intake', {
    method: 'POST',
    body: { page: pageId, answers },
  })
  if (error) throw error
  return data
}
