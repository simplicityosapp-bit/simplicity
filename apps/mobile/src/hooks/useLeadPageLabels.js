import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/* The public lead pages a pending submission can have come from — only their
   titles and field definitions, so the review card can say "from: <page>" and
   label each submitted answer the way the page asked it. Loaded only while
   something is waiting for review. Best-effort: without it the card still
   shows every answer, keyed by field id. */
export function useLeadPageLabels(enabled) {
  const [pages, setPages] = useState([])
  useEffect(() => {
    if (!enabled) return undefined
    let alive = true
    supabase.from('lead_pages').select('id,title,fields').is('deleted_at', null).limit(500)
      .then(({ data }) => { if (alive && Array.isArray(data)) setPages(data) }, () => {})
    return () => { alive = false }
  }, [enabled])
  return pages
}
