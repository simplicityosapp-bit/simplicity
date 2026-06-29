/* ════════════════════════════════════════════════════════════════
   SITE INTAKE — public client for the `site-intake` edge function.
   ════════════════════════════════════════════════════════════════
   Used by the public page builder page (/p/<id>), reachable WITHOUT
   login. Sibling of leadIntake.js. The edge function holds the service
   role; this client carries only the anon key. It is the ONLY path the
   public page uses to read a page config or submit a form — the
   site_pages / leads tables are never touched directly from the browser. */

import { supabase } from '../supabase'

/* Fetch a published page's public config ({ id, kind, theme, sections,
   config }). Throws 'not_found' when missing / unpublished / deleted. */
export async function fetchSitePageConfig(pageId, kind) {
  const qs = kind ? `&kind=${encodeURIComponent(kind)}` : ''
  const { data, error } = await supabase.functions.invoke(
    `site-intake?page=${encodeURIComponent(pageId)}${qs}`,
    { method: 'GET' },
  )
  if (error) throw new Error('not_found')
  return data
}

/* Submit one form section's answers. `answers` is a flat { key: value } map
   (plus the honeypot `_hp`). Returns { ok, thankYou }. */
export async function submitSiteForm(pageId, sectionId, answers, kind) {
  const { data, error } = await supabase.functions.invoke('site-intake', {
    method: 'POST',
    body: { page: pageId, section: sectionId, answers, kind },
  })
  if (error) throw error
  return data
}
