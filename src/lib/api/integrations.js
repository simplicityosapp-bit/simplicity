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
