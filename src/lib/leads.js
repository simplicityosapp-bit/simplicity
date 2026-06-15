/* ════════════════════════════════════════════════════════════════
   LEADS — kanban bucketing + helpers (ported from leads.js / core.js).
   ════════════════════════════════════════════════════════════════
   4 fixed meta columns (D24). Sub-status + source come from their tables.
   ════════════════════════════════════════════════════════════════ */

import { leads, lead_sources, lead_statuses } from '../data/mock'

const live = (a) => (a || []).filter((r) => !r.deleted_at)

/* 3 fixed meta columns. "רפאים" (ghost) is no longer its own column —
   it became a SUB-status under "לא רלוונטי" (migration 0009). */
export const LEAD_META = [
  { key: 'in_process', title: 'בתהליך' },
  { key: 'converted', title: 'הומרו' },
  { key: 'not_relevant', title: 'לא רלוונטי' },
]

export const statusMetaOfLead = (l) => l.status_meta || 'in_process'
/* A lead counts as a (real) conversion only while it is CURRENTLY in the
   'converted' meta. A converted lead later moved back to 'not relevant' /
   'in process' keeps its converted_at stamp (the kanban drag path doesn't
   clear it), but is no longer a conversion — every conversion COUNT gates on
   this so a reverted conversion drops out of the rate. Mirrors the LeadCard
   badge (meta === 'converted' && converted_to_client_id). */
export const isConvertedLead = (l) => statusMetaOfLead(l) === 'converted' && !!l.converted_at
export const sourceOf = (id) => lead_sources.find((s) => s.id === id)
export const subStatusOf = (id) => lead_statuses.find((s) => s.id === id)

/* Column accent = the default sub-status colour for that meta. */
export function metaColor(key) {
  const def = lead_statuses.find((s) => s.meta_category === key && s.is_default)
  return def?.color || 'var(--stone)'
}

export function leadsByMeta() {
  const all = live(leads)
  const out = {}
  LEAD_META.forEach((m) => {
    out[m.key] = all.filter((l) => statusMetaOfLead(l) === m.key)
  })
  return out
}

export function leadStats(now = new Date()) {
  const all = live(leads)
  const inMonth = (d) => {
    if (!d) return false
    const x = new Date(d)
    return x.getFullYear() === now.getFullYear() && x.getMonth() === now.getMonth()
  }
  const newThisMonth = all.filter((l) => (l.inquiry_date ? inMonth(l.inquiry_date) : inMonth(l.created_at)))
  const convertedThisMonth = all.filter((l) => isConvertedLead(l) && inMonth(l.converted_at)).length
  const cohortConverted = newThisMonth.filter(isConvertedLead).length
  const convRate = newThisMonth.length ? Math.round((cohortConverted / newThisMonth.length) * 100) : null
  return { newThisMonth: newThisMonth.length, convertedThisMonth, convRate }
}
