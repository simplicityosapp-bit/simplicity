/* ════════════════════════════════════════════════════════════════
   LEADS — kanban bucketing + helpers (ported from leads.js / core.js).
   ════════════════════════════════════════════════════════════════
   4 fixed meta columns (D24). Sub-status + source come from their tables.
   ════════════════════════════════════════════════════════════════ */

import i18n from '../i18n'

export interface LeadMeta { key: string; title: string }

export interface Lead {
  status_meta?: string
  converted_at?: string | null
  pending_review?: boolean
}

export interface LeadStatus {
  meta_category?: string
  is_default?: boolean
  color?: string
}

/* 3 fixed meta columns. "רפאים" (ghost) is no longer its own column —
   it became a SUB-status under "לא רלוונטי" (migration 0009). The `title`
   is the Hebrew fallback; the live label is resolved per-language via
   metaTitle() so the kanban + statuses panel re-translate on switch. */
export const LEAD_META: LeadMeta[] = [
  { key: 'in_process', title: 'בתהליך' },
  { key: 'converted', title: 'הומרו' },
  { key: 'not_relevant', title: 'לא רלוונטי' },
]

/* Localized column label for a meta key. Components call this at render
   (they all use useT, so they re-render on language change). Falls back to
   the Hebrew title baked into LEAD_META if the key/namespace is unresolved. */
export const metaTitle = (key: string): string =>
  i18n.t(`leads:meta.${key}`, { defaultValue: LEAD_META.find((m) => m.key === key)?.title || key })

export const statusMetaOfLead = (l: Lead): string => l.status_meta || 'in_process'
/* A lead counts as a (real) conversion only while it is CURRENTLY in the
   'converted' meta. A converted lead later moved back to 'not relevant' /
   'in process' keeps its converted_at stamp (the kanban drag path doesn't
   clear it), but is no longer a conversion — every conversion COUNT gates on
   this so a reverted conversion drops out of the rate. Mirrors the LeadCard
   badge (meta === 'converted' && converted_to_client_id). */
export const isConvertedLead = (l: Lead): boolean => statusMetaOfLead(l) === 'converted' && !!l.converted_at
/* A lead from a public page awaiting manual approval. Pending leads are
   hidden from the kanban + stats and surface only in the review section +
   the home "דורש תשומת לב" widget until approved (pending_review → false). */
export const isPendingReview = (l: Lead): boolean => !!l.pending_review

/* Column accent = the default sub-status colour for that meta. Pass the
   user's real lead_statuses (from useLeadStatuses) so the kanban reflects
   their customised colours; falls back to a neutral token when absent. */
export function metaColor(key: string, statuses?: LeadStatus[]): string {
  const def = (statuses || []).find((s) => s.meta_category === key && s.is_default)
  return def?.color || 'var(--stone)'
}
