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
export const FIELD_TYPES = ['text', 'tel', 'email', 'textarea']

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
  thankYou: {
    mode: 'message', // 'message' | 'redirect'
    message: 'תודה! קיבלנו את הפנייה ונחזור אליך בהקדם.',
    url: '',
  },
}

/* A fresh page's starting config (before the coach edits anything). */
export const newLeadPageDraft = () => ({
  title: '',
  published: false,
  auto_approve: false,
  project_id: '',
  content: structuredClone(DEFAULT_CONTENT),
  fields: structuredClone(DEFAULT_FIELDS),
})

/* Stable key for a newly-added free field (avoids collisions with builtins
   and with each other). Index-based, slugged — labels can repeat. */
export const freeFieldKey = (existing = []) => {
  const taken = new Set(existing.map((f) => f.key))
  let n = 1
  while (taken.has(`field_${n}`)) n += 1
  return `field_${n}`
}

/* Public URL for a page id. Absolute so it's shareable / copyable. */
export const publicLeadPageUrl = (id) => `${window.location.origin}/lead/${id}`
