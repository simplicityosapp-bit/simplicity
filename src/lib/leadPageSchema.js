/* ════════════════════════════════════════════════════════════════
   LEAD PAGE SCHEMA — shared contract for the builder + public page.
   ════════════════════════════════════════════════════════════════
   Defines the field model, content defaults, and the builtin→leads
   column mapping. The `lead-intake` edge function (Deno, separate
   runtime) MIRRORS the mapping in BUILTIN_COLUMN below — keep the two
   in sync if you add/rename a builtin field. */

/* Default brand color = the app's primary accent (terracotta). */
export const DEFAULT_BRAND_COLOR = '#C97B5E'

/* Supported field types for the form builder. `key` is what the public
   page submits; `builtin` fields map to real `leads` columns, the rest
   land in `leads.data` (JSONB). */
export const FIELD_TYPES = ['text', 'tel', 'email', 'textarea', 'select', 'checkbox']

/* Choice types carry an `options` array. 'select' = single choice (radio),
   'checkbox' = multiple choice. */
export const isChoiceType = (type) => type === 'select' || type === 'checkbox'
export const defaultChoiceOptions = () => ['אפשרות 1', 'אפשרות 2']

/* The four default fields. A coach can toggle their `required` flag and
   reorder/remove them, but their `key` is reserved (builtin). */
export const DEFAULT_FIELDS = [
  { key: 'name', label: 'שם', type: 'text', required: true, builtin: true },
  { key: 'phone', label: 'טלפון', type: 'tel', required: false, builtin: true },
  { key: 'email', label: 'אימייל', type: 'email', required: false, builtin: true },
  { key: 'note', label: 'הערה', type: 'textarea', required: false, builtin: true },
]

/* builtin field key → leads column. Free (non-builtin) fields are stored
   under leads.data keyed by their `key`. MIRRORED in the edge function. */
export const BUILTIN_COLUMN = {
  name: 'name',
  phone: 'phone',
  email: 'email',
  note: 'notes',
}

export const DEFAULT_CONTENT = {
  logoText: '',
  heading: '',
  body: '',
  brandColor: DEFAULT_BRAND_COLOR,
  // Advanced display (all optional; defaults keep the current look):
  background: '',      // '' = default gradient; else a Simplicity scene key
  cardOpacity: 100,    // 0–100 — how solid the form card is over the background
  cardBlur: 14,        // px — glass blur behind a transparent card
  cardRadius: 24,      // px — card corner roundness (24 = the original look)
  bold: false,         // heavier heading + text
  textColor: 'dark',   // 'dark' | 'light' (light for dark backgrounds)
  textAlign: 'start',  // 'start' (right, RTL) | 'center'
  thankYou: {
    mode: 'message', // 'message' | 'redirect'
    message: 'תודה! קיבלנו את הפנייה ונחזור אליך בהקדם.',
    url: '',
  },
}

/* Curated Simplicity nature scenes the coach can pick as a page background.
   Each maps to /backgrounds/desktop/<day|night>/<key>.webp. */
export const LEAD_PAGE_BACKGROUNDS = [
  { key: 'home', label: 'שדה' },
  { key: 'leads', label: 'נהר' },
  { key: 'clients', label: 'יער' },
  { key: 'finance', label: 'הרים' },
  { key: 'projects', label: 'אגם' },
  { key: 'goals', label: 'שביל' },
  { key: 'calendar', label: 'בוקר' },
  { key: 'moon', label: 'לילה' },
  { key: 'reports', label: 'ערפל' },
  { key: 'tasks', label: 'עצים' },
]

export const leadPageBgUrl = (key, variant = 'day') => `/backgrounds/desktop/${variant}/${key}.webp`

/* Shared surface styling for the public page AND the builder canvas, so the
   builder is true WYSIWYG. Returns inline CSS vars + a className string; both
   are applied to a `.lp-surface` element (the public `.lp-root` and the
   builder `.lpe-canvas`). */
export function leadPageSurface(content = {}) {
  const c = content || {}
  const bg = (c.background || '').toString().trim()
  const opacity = typeof c.cardOpacity === 'number' ? c.cardOpacity : 100
  const blur = typeof c.cardBlur === 'number' ? c.cardBlur : 14
  const radius = typeof c.cardRadius === 'number' ? c.cardRadius : 24
  const style = {
    '--lp-brand': c.brandColor || DEFAULT_BRAND_COLOR,
    '--lp-card-opacity': `${Math.max(0, Math.min(100, opacity))}%`,
    '--lp-card-blur': `${Math.max(0, blur)}px`,
    '--lp-radius': `${Math.max(8, Math.min(48, radius))}px`,
  }
  if (bg) {
    style['--lp-bg-day'] = `url(${leadPageBgUrl(bg, 'day')})`
    style['--lp-bg-night'] = `url(${leadPageBgUrl(bg, 'night')})`
  }
  const cls = [
    bg ? 'has-bg' : '',
    c.bold ? 'is-bold' : '',
    c.textColor === 'light' ? 'text-light' : '',
    c.textAlign === 'center' ? 'align-center' : '',
  ].filter(Boolean).join(' ')
  return { style, cls }
}

/* A fresh page's starting config (before the coach edits anything). */
export const newLeadPageDraft = () => ({
  title: '',
  published: false,
  auto_approve: false,
  project_id: '',
  slug: '',
  content: structuredClone(DEFAULT_CONTENT),
  fields: structuredClone(DEFAULT_FIELDS),
})

/* Normalize a user-typed slug → lowercase, alnum + single hyphens, trimmed,
   capped at 40. Mirrors the DB CHECK (0048). Returns '' for empty/garbage. */
export const normalizeSlug = (s) => (s || '')
  .toString().trim().toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 40)
  .replace(/-+$/g, '') // re-trim if the slice landed on a hyphen

/* A normalized slug is valid when it's 3–40 chars (the DB CHECK range). */
export const isValidSlug = (s) => /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(s)

/* Stable key for a newly-added free field (avoids collisions with builtins
   and with each other). Index-based, slugged — labels can repeat. */
export const freeFieldKey = (existing = []) => {
  const taken = new Set(existing.map((f) => f.key))
  let n = 1
  while (taken.has(`field_${n}`)) n += 1
  return `field_${n}`
}

/* Public URL for a page. Pass the slug when set, else the uuid — both
   resolve at /lead/<x> (the edge fn matches a uuid OR a slug). Absolute so
   it's shareable / copyable. */
export const publicLeadPageUrl = (slugOrId) => `${window.location.origin}/lead/${slugOrId}`
