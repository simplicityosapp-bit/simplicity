/* ════════════════════════════════════════════════════════════════
   SITE PAGES API — Supabase data access (RLS-scoped to the user).
   ════════════════════════════════════════════════════════════════
   The builder config for the unified page model (site_pages): landing /
   lead / booking pages, all on one block engine. The PUBLIC page never
   reads this table — a service-role edge function serves the published
   config and writes the resulting submission. Here we only manage the
   owner's own pages. Mirrors leadPages.js / bookingPages.js. */

import { supabase } from '../supabase'
import { selectAllRows } from './paginate'

const SERVER_OWNED = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']
const sanitize = (input) => {
  const row = { ...input }
  SERVER_OWNED.forEach((k) => delete row[k])
  return row
}

/* List the owner's non-deleted pages, newest first. Pass a kind to filter the
   hub to one builder (landing / lead / booking); omit it for all kinds. */
export async function listSitePages(kind) {
  return selectAllRows(() => {
    let q = supabase
      .from('site_pages')
      .select('*')
      .is('deleted_at', null)
    if (kind) q = q.eq('kind', kind)
    return q.order('created_at', { ascending: false })
  })
}

export async function getSitePage(id) {
  const { data, error } = await supabase
    .from('site_pages')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function insertSitePage(input) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('אין חיבור פעיל — התחבר/י מחדש')
  const row = sanitize(input)
  row.user_id = session.user.id
  const { data, error } = await supabase.from('site_pages').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateSitePage(id, patch) {
  const { data, error } = await supabase
    .from('site_pages')
    .update(sanitize(patch))
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function removeSitePage(id) {
  const { error } = await supabase
    .from('site_pages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function restoreSitePage(id) {
  const { data, error } = await supabase
    .from('site_pages')
    .update({ deleted_at: null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
