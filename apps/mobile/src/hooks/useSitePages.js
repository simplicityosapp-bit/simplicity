import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const BASE = 'https://simplicity-os.com'

// Public pages (read-only on mobile — the builder is desktop): landing/lead
// site_pages + booking_pages, normalized to { id, title, kind, published, url }.
// Each kind maps to its public route, addressed by slug when the page has one
// and by id otherwise — exactly as web's publicSitePageUrl does. A page without
// a slug used to share ".../p/null".
//
// The legacy lead_pages table is not read: lead pages have lived in site_pages
// (kind 'lead') since migration 0068 and web no longer lists that table, so
// reading both showed every migrated page twice.
export function useSitePages() {
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [{ data: sp, error: se }, { data: bp, error: be }] = await Promise.all([
        supabase.from('site_pages').select('id,kind,title,published,slug').is('deleted_at', null).limit(500),
        supabase.from('booking_pages').select('id,title,published,slug').is('deleted_at', null).limit(500),
      ])
      if (se) throw se
      if (be) throw be
      const norm = []
      ;(sp ?? []).forEach((p) => norm.push({ id: p.id, title: p.title, kind: p.kind === 'lead' ? 'lead' : 'landing', published: !!p.published, url: `${BASE}/${p.kind === 'lead' ? 'lead' : 'p'}/${p.slug || p.id}` }))
      ;(bp ?? []).forEach((p) => norm.push({ id: p.id, title: p.title, kind: 'booking', published: !!p.published, url: `${BASE}/book/${p.slug || p.id}` }))
      setPages(norm)
    } catch (e) {
      setError(e?.message || 'load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { pages, loading, error, refetch: load }
}
