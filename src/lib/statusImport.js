/* ════════════════════════════════════════════════════════════════
   STATUS IMPORT — detect status columns + map values to meta buckets.
   ════════════════════════════════════════════════════════════════
   When an imported sheet has a STATUS column (client statuses or lead
   statuses), we want to:
     1. Recognise the column as statuses.
     2. Guess whether it's CLIENT or LEAD statuses (from context: the
        column header, the file/sheet name, and the value vocabulary).
     3. Map each distinct value to a fixed meta_category, by keyword.
     4. Let the user correct ALL of the above, then create the
        client_statuses / lead_statuses rows so the kanban/lists are
        pre-populated — and link each imported record to its status.
   Everything is pure + overridable; the UI passes explicit config.

   Fixed meta categories (must match the DB CHECK constraints):
     - lead:   in_process | converted | not_relevant | ghost
     - client: active | wandering | past | no_status
   ════════════════════════════════════════════════════════════════ */

const norm = (s) => String(s == null ? '' : s).trim().toLowerCase().replace(/["'`״׳]/g, '').replace(/\s+/g, '')

/* Header words that mark a column as holding statuses. */
const STATUS_HEADER_HINTS = ['status', 'stage', 'state', 'סטטוס', 'מצב', 'שלב', 'סטאטוס']

/* Lead-context hints (header / file / sheet name) → these statuses are
   for LEADS, not clients. */
const LEAD_CONTEXT_HINTS = ['lead', 'leads', 'ליד', 'לידים', 'פניות', 'פנייה', 'מתעניינים', 'פוטנציאלי']
const CLIENT_CONTEXT_HINTS = ['client', 'clients', 'customer', 'לקוח', 'לקוחות', 'מטופל', 'מטופלים', 'חניך']

/* Value → meta_category keyword maps. First match wins; unmatched
   values fall back to the kind's default bucket. */
const LEAD_META_KEYWORDS = {
  converted:    ['הומר', 'הומרו', 'נסגר', 'סגור', 'סגרה', 'סגר', 'נסגרה', 'הצליח', 'won', 'converted', 'closed', 'client'],
  /* "רפאים"/ghost folded into not_relevant — it's a reason, not a column. */
  not_relevant: ['לארלוונטי', 'לאמתאים', 'נדחה', 'סירב', 'ביטל', 'lost', 'notrelevant', 'rejected', 'declined', 'רפאים', 'נעלם', 'אינוסע', 'גוסט', 'ghost', 'noresponse', 'איןמענה'],
  in_process:   ['בתהליך', 'חדש', 'חם', 'בשיחה', 'בקשר', 'מעקב', 'פולואפ', 'פולו', 'new', 'inprocess', 'inprogress', 'contacted', 'followup', 'hot', 'warm'],
}
const CLIENT_META_KEYWORDS = {
  /* "לא רלוונטי"/"לא פעיל" on a client means not-active → past (clients
     have no not_relevant bucket). Checked before 'active' so "לא פעיל"
     doesn't match the 'פעיל' substring. */
  past:      ['לשעבר', 'עבר', 'הסתיים', 'סיים', 'לאפעיל', 'לארלוונטי', 'לארלוונטית', 'נטש', 'עזב', 'past', 'former', 'inactive', 'ended', 'churned'],
  wandering: ['ביניים', 'נודד', 'נודדת', 'מתנדנד', 'wandering', 'lapsing', 'atrisk'],
  no_status: ['ללאסטטוס', 'ללא', 'nostatus', 'none'],
  active:    ['פעיל', 'פעילה', 'פעיל/ת', 'קבוע', 'active', 'current'],
}

export const LEAD_METAS = ['in_process', 'converted', 'not_relevant']
export const CLIENT_METAS = ['active', 'wandering', 'past', 'no_status']
export const LEAD_META_LABELS = { in_process: 'בתהליך', converted: 'הומרו', not_relevant: 'לא רלוונטי' }
export const CLIENT_META_LABELS = { active: 'פעיל', wandering: 'ביניים', past: 'לשעבר', no_status: 'ללא סטטוס' }
const LEAD_DEFAULT = 'in_process'
const CLIENT_DEFAULT = 'active'

/* Is this header a status column? */
export function isStatusHeader(header) {
  const n = norm(header)
  if (!n) return false
  return STATUS_HEADER_HINTS.some((h) => n === norm(h) || n.includes(norm(h)))
}

/* Guess whether a detected status column is for leads or clients, using
   the column header + any surrounding context strings (file/sheet name).
   Returns 'lead' | 'client'. Defaults to 'client' when ambiguous. */
export function guessStatusKind(header, contextStrings = []) {
  const hay = [header, ...contextStrings].map(norm).join(' ')
  const leadHit = LEAD_CONTEXT_HINTS.some((h) => hay.includes(norm(h)))
  const clientHit = CLIENT_CONTEXT_HINTS.some((h) => hay.includes(norm(h)))
  if (leadHit && !clientHit) return 'lead'
  if (clientHit && !leadHit) return 'client'
  /* Tie / none: lean on the value vocabulary later; default client. */
  return 'client'
}

/* Map one status VALUE → a meta_category for the given kind. */
export function mapValueToMeta(value, kind) {
  return mapValueToMetaConfident(value, kind).meta
}

/* Like mapValueToMeta but also reports whether the mapping was a real
   keyword MATCH (confident) or just the fallback default (unsure). The
   UI uses `confident:false` to ask the user to confirm the bucket
   instead of silently filing an unknown status as active/in_process. */
export function mapValueToMetaConfident(value, kind) {
  const n = norm(value)
  if (!n) return { meta: kind === 'lead' ? LEAD_DEFAULT : CLIENT_DEFAULT, confident: false }
  const table = kind === 'lead' ? LEAD_META_KEYWORDS : CLIENT_META_KEYWORDS
  for (const [meta, words] of Object.entries(table)) {
    if (words.some((w) => n === norm(w) || n.includes(norm(w)))) return { meta, confident: true }
  }
  return { meta: kind === 'lead' ? LEAD_DEFAULT : CLIENT_DEFAULT, confident: false }
}

/* Collect the distinct status values in a column and pre-map each to a
   meta_category. Returns { kind, values: [{ value, meta }] }.
   `kind` is the guessed kind; `values` preserves first-seen order. */
export function buildStatusMapping(headers, rows, colIdx, contextStrings = []) {
  const header = headers[colIdx]
  const kind = guessStatusKind(header, contextStrings)
  const seen = new Map()
  rows.forEach((r) => {
    const raw = String(r[colIdx] == null ? '' : r[colIdx]).trim()
    if (!raw || seen.has(raw)) return
    seen.set(raw, mapValueToMeta(raw, kind))
  })
  return {
    colIdx,
    kind,
    values: Array.from(seen.entries()).map(([value, meta]) => ({ value, meta })),
  }
}

/* Derive the unique status rows to create from a finalized mapping.
   Returns [{ kind, meta_category, display_name }] — one per distinct
   value (deduped by kind+display_name). The caller inserts these into
   client_statuses / lead_statuses and links records by display_name. */
export function statusRowsToCreate(mapping) {
  if (!mapping) return []
  const { kind, values } = mapping
  const out = []
  const seen = new Set()
  values.forEach(({ value, meta }) => {
    const key = `${kind}:${value}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ kind, meta_category: meta, display_name: value })
  })
  return out
}

/* Auto-detect status columns in a header row (for the flat pipeline). */
export function detectStatusColumns(headers) {
  return (headers || [])
    .map((h, idx) => ({ idx, header: h }))
    .filter(({ header }) => isStatusHeader(header))
    .map(({ idx }) => idx)
}
