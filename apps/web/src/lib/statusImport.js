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
  converted:    ['הומר', 'הומרו', 'נסגר', 'סגור', 'סגרה', 'סגר', 'נסגרה', 'הצליח', 'won', 'converted', 'closed', 'client',
    /* the deal closed POSITIVELY — became a paying client. */
    'הפךללקוח', 'נהייהלקוח', 'נהפךללקוח', 'רכש', 'קנה', 'שילם', 'נרשם', 'נרשמה', 'הצטרף', 'הצטרפה', 'חתם', 'חתמה', 'חתימה',
    'signed', 'paid', 'purchased', 'bought', 'joined', 'enrolled', 'deal',
    /* more real "closed-won" phrasings from coach CRMs. */
    'התחילטיפול', 'נקלט', 'נכנסלטיפול', 'הפךלמטופל', 'רכשחבילה', 'רכשמנוי', 'קנהכרטיסיה', 'קנתהכרטיסיה', 'הצטרףלליווי',
    'הצטרףלקבוצה', 'נכנסלקבוצה', 'נכנסלליווי', 'סגרליווי', 'סגרחבילה', 'חתםחוזה', 'חתםהסכם', 'נחתם', 'שובץ', 'התחילליווי',
    'גייסתי', 'אישרהשתתפות', 'הצעהאושרה', 'שילםמקדמה'],
  /* "רפאים"/ghost folded into not_relevant — it's a reason, not a column. */
  not_relevant: ['לארלוונטי', 'לאמתאים', 'נדחה', 'סירב', 'ביטל', 'lost', 'notrelevant', 'rejected', 'declined', 'רפאים', 'נעלם', 'אינוסע', 'גוסט', 'ghost', 'noresponse', 'איןמענה',
    /* dead/unqualified leads: no answer, no budget, not interested. */
    'לאענה', 'לאעונה', 'לאעונים', 'לאעניתי', 'לאזמין', 'איןתקציב', 'יקרלו', 'יקרמדי', 'לאמעוניין', 'לאמעונין', 'לאמתעניין',
    'פספוס', 'אבוד', 'disqualified', 'nobudget', 'notinterested', 'unqualified', 'dead', 'cancelled', 'canceled',
    /* more real disqualified/dead phrasings. */
    'איןהתאמה', 'התחרט', 'התחרטה', 'מחירלאמתאים', 'לאבתקציב', 'רקשאל', 'ספאם', 'spam', 'רחוקמדי', 'רחוקגאוגרפית',
    'בחרמתחרה', 'בחרבמתחרה', 'בחרמטפלאחר', 'התקרר', 'התקררה', 'לאבשל', 'לאהבשיל', 'פנייהכפולה', 'השעהלאמתאימה',
    'דחה', 'דחתה', 'לאמתאיםתקציבית', 'לאמתאיםלקבוצה', 'לאנפתחהקבוצה', 'לאבאלניסיון'],
  in_process:   ['בתהליך', 'חדש', 'חם', 'בשיחה', 'בקשר', 'מעקב', 'פולואפ', 'פולו', 'new', 'inprocess', 'inprogress', 'contacted', 'followup', 'hot', 'warm',
    /* active pipeline stages coaches actually write. */
    'תיאוםפגישה', 'תאוםפגישה', 'פגישהנקבעה', 'נקבעהפגישה', 'קבעתיפגישה', 'פגישה', 'תיאום',
    'הצעתמחיר', 'הצעה', 'שלחתיהצעה', 'הצעהנשלחה', 'ממתיןלהחלטה', 'ממתין', 'ממתינה', 'בהמתנה', 'בהמתנהלתשובה',
    'להתקשר', 'לחזוראליו', 'לחזוראליה', 'לחזור', 'שיחה', 'שיחתהיכרות', 'במשאומתן', 'משאומתן', 'משאמתן', 'חימום',
    'קר', 'פושר', 'מתעניין', 'מתעניינת', 'interested', 'meeting', 'scheduled', 'quote', 'proposal', 'pending',
    'waiting', 'negotiation', 'callback', 'cold', 'lukewarm', 'nurturing',
    /* more real top/mid-funnel phrasings. */
    'פנייהראשונית', 'פנייהחדשה', 'פנייה', 'שיחתהכרות', 'התעניינות', 'השאירפרטים', 'השאירההודעה', 'השאירהודעה',
    'חזרתיאליו', 'שיחתייעוץ', 'שיחתאבחון', 'שיחתתיאום', 'שיחתתיאוםציפיות', 'אבחון', 'מילאטופס', 'מעוניין', 'מעוניינת',
    'בהתלבטות', 'חושבעלזה', 'מחמם', 'לתזכר', 'בבירור', 'בבירורהתאמה', 'נקבעאבחון', 'קבעאבחון', 'קבעפגישה', 'קבעשיחה',
    'לפנישיחתהיכרות', 'לפניאבחון', 'לפניהרשמה', 'רשוםלניסיון', 'שיעורניסיון', 'לידחם', 'לידקר', 'לידפושר',
    'נשלחההצעה', 'נשלחההצעתמחיר', 'ממתיןלהצעתמחיר', 'שלחתיפרטים', 'תיאוםשיחה', 'מתלבט', 'מתלבטת'],
}
const CLIENT_META_KEYWORDS = {
  /* "לא רלוונטי"/"לא פעיל" on a client means not-active → past (clients
     have no not_relevant bucket). Checked before 'active' so "לא פעיל"
     doesn't match the 'פעיל' substring. */
  past:      ['לשעבר', 'עבר', 'הסתיים', 'סיים', 'סיימה', 'לאפעיל', 'לארלוונטי', 'לארלוונטית', 'נטש', 'נטשה', 'עזב', 'עזבה',
    /* dropped out / stopped / cancelled / finished the program. */
    'נשר', 'נשרה', 'נשירה', 'הפסיק', 'הפסיקה', 'הפסיקטיפול', 'בוטל', 'בוטלה', 'עזיבה', 'הושלם', 'גמר', 'גמרה',
    'past', 'former', 'inactive', 'ended', 'churned', 'dropped', 'quit', 'left', 'completed', 'finished', 'done',
    /* more "finished / lapsed / archived" phrasings (incl. career placement). */
    'בוגר', 'בוגרת', 'בוגרליווי', 'פרש', 'פרשה', 'שוחרר', 'לאחידש', 'לאחידשה', 'פגתוקף', 'כרטיסיהנגמרה', 'כרטיסייהנגמרה',
    'מנויהסתיים', 'מנויפג', 'לאחזר', 'לאחזרה', 'לאהמשיך', 'לאממשיך', 'התקבללעבודה', 'מצאעבודה', 'הושם', 'השתבץ',
    'השיגיעד', 'הגיעליעד', 'השלים', 'סייםתהליך', 'סייםליווי', 'סייםחבילה', 'סייםקורס', 'סייםהכשרה',
    'ביטלליווי', 'ביטלהרשמה', 'עזבאתהסטודיו', 'הופנההלאה', 'תיקסגור', 'ארכיון', 'לקוחארכיון', 'לקוחישן', 'מטופללשעבר', 'מתאמןלשעבר'],
  /* Frozen / on-hold / paused folds into wandering — clients have no
     dedicated frozen bucket, and a frozen client is between active & gone.
     Checked before 'active' so "מוקפא"/"בהפסקה" don't slip on a substring. */
  wandering: ['ביניים', 'נודד', 'נודדת', 'מתנדנד', 'wandering', 'lapsing', 'atrisk',
    'הוקפא', 'הוקפאה', 'בהקפאה', 'מוקפא', 'מוקפאת', 'הקפאה', 'מושהה', 'השהיה', 'השהייה', 'בהשהיה', 'בהפסקה', 'בחופשה', 'בהפוגה',
    'frozen', 'onhold', 'hold', 'paused', 'pause', 'suspended', 'break',
    /* on a break / occasional / trial / waitlisted / between cycles. */
    'חופשתלידה', 'מילואים', 'בחלת', 'בהריון', 'פסקזמן', 'עלהקרח', 'בפאוזה', 'הפסקהזמנית', 'הקפאתליווי', 'הקפאתמנוי',
    'מנוימוקפא', 'יצאלהפסקה', 'מזדמן', 'מזדמנת', 'חדפעמי', 'חדפעמית', 'ניסיון', 'שיעורניסיון', 'מתלבט', 'מתלבטת', 'בחימום',
    'רשימתהמתנה', 'בהמתנה', 'ממתין', 'ממתינה', 'טרםהצטרף', 'ביןמפגשים', 'ביןחבילות', 'ביןמחזורים',
    'לקראתסיום', 'לקראתחידוש', 'לקראתסגירה', 'פוטנציאללחידוש'],
  no_status: ['ללאסטטוס', 'ללא', 'nostatus', 'none', 'טרםהתחיל'],
  active:    ['פעיל', 'פעילה', 'פעיל/ת', 'קבוע', 'קבועה', 'ממשיך', 'ממשיכה', 'בטיפול', 'בליווי', 'vip', 'active', 'current', 'ongoing', 'continuing',
    /* more "currently engaged" phrasings (incl. yoga/fitness & retainer). */
    'שוטף', 'במעקב', 'חוזר', 'משלם', 'בקורס', 'בתוכנית', 'בהכשרה', 'בקבוצה', 'בקבוצהפעילה', 'מתאמןקבוע', 'לקוחקבוע',
    'מנויפעיל', 'כרטיסיהפעילה', 'כרטיסייהפעילה', 'בכרטיסיה', 'בליווישוטף', 'ליווישוטף', 'ריטיינר', 'בחוזה', 'נוכח',
    'רשום', 'מתמיד', 'מתמשך', 'בתהליךטיפול', 'בתהליךליווי'],
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
