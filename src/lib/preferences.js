/* ════════════════════════════════════════════════════════════════
   PREFERENCES SHAPE — default values + migration.
   ════════════════════════════════════════════════════════════════
   The user_preferences.preferences JSONB blob carries everything:
   profile, format, design, widgets. Reports config still lives in
   localStorage (mg-reports-config) — will be migrated here later.
   ════════════════════════════════════════════════════════════════ */

/* Registry of home widgets. Order here = default order. Each widget
   in DEFAULT_WIDGETS.list mirrors registry entries. */
export const WIDGET_REGISTRY = [
  { id: 'quote',      label: 'ציטוט יומי',          defaultAccent: 'blush',      supportsCompact: false },
  { id: 'moon',       label: 'מבט על',              defaultAccent: 'sage',       supportsCompact: true },
  { id: 'insights',   label: 'מה איתך היום',        defaultAccent: 'sage',       supportsCompact: false },
  { id: 'quick-row',  label: 'תנועה / עדכון מהיר',  defaultAccent: 'terracotta', supportsCompact: false },
  { id: 'attention',  label: 'התראות (פגישות, תשלומים)', defaultAccent: 'amber',  supportsCompact: true },
  { id: 'reminders',  label: 'תזכורות קרובות',       defaultAccent: 'amber',      supportsCompact: true },
  { id: 'next-tasks', label: 'המשימות הבאות',        defaultAccent: 'terracotta', supportsCompact: false },
  { id: 'chips',      label: 'כרטיסי-מצב (לקוחות/נטו/משימות)', defaultAccent: 'sage', supportsCompact: false },
]

/* 5-color brand palette (design-tokens.md §1 — Brand & States). The
   legacy 7-accent set (mint/teal/gold/cyan/purple/moon) was migrated
   out — see migrateWidgets() for the value remap. */
export const ACCENT_OPTIONS = [
  { v: 'terracotta', l: 'טרקוטה',  color: '#C97B5E' },
  { v: 'blush',      l: 'בלוש',    color: '#F4E3DA' },
  { v: 'sage',       l: 'מרווה',   color: '#8BA888' },
  { v: 'amber',      l: 'אמבר',    color: '#D4A574' },
  { v: 'clay',       l: 'חמרה',    color: '#B5634E' },
]

/* Legacy → new accent map (one-time migration on read). */
const ACCENT_REMAP = {
  mint:   'sage',
  teal:   'sage',
  gold:   'amber',
  cyan:   'blush',
  purple: 'clay',
  moon:   'blush',
  /* identity for the new set */
  terracotta: 'terracotta',
  blush:      'blush',
  sage:       'sage',
  amber:      'amber',
  clay:       'clay',
}

export const ROLE_LABELS = {
  therapist:   'מטפל/ת',
  coach:       'מאמן/ת',
  facilitator: 'מנחה',
  teacher:     'מורה',
  instructor:  'מדריך/ה',
  other:       'אחר',
}

export const CURRENCY_OPTIONS = [
  { v: 'ILS', l: '₪ שקל', sym: '₪' },
  { v: 'USD', l: '$ דולר', sym: '$' },
  { v: 'EUR', l: '€ יורו', sym: '€' },
]

export const DATE_FORMAT_OPTIONS = [
  { v: 'DD/MM/YY',   l: 'DD/MM/YY' },
  { v: 'MM/DD/YY',   l: 'MM/DD/YY' },
  { v: 'YYYY-MM-DD', l: 'YYYY-MM-DD' },
]

export const TIME_FORMAT_OPTIONS = [
  { v: '24h', l: '24 שעות' },
  { v: '12h', l: '12h (AM/PM)' },
]

export const WEEK_START_OPTIONS = [
  { v: 'sunday', l: 'ראשון' },
  { v: 'monday', l: 'שני' },
]

export const TEXT_SIZE_OPTIONS = [
  { v: 'small',  l: 'קטן' },
  { v: 'normal', l: 'רגיל' },
  { v: 'large',  l: 'גדול' },
]

export const GENDER_OPTIONS = [
  { v: 'neutral', l: 'נייטרלי' },
  { v: 'female',  l: 'נקבה' },
  { v: 'male',    l: 'זכר' },
]

export const CARD_STYLE_OPTIONS = [
  { v: 'frosted',  l: 'מעורפל' },
  { v: 'flat',     l: 'שטוח' },
  { v: 'outlined', l: 'מתואר' },
]

export const TEXT_STRENGTH_OPTIONS = [
  { v: 'normal', l: 'רגיל' },
  { v: 'bold',   l: 'מודגש' },
]

export const DENSITY_OPTIONS = [
  { v: 'compact',     l: 'צפוף' },
  { v: 'comfortable', l: 'רגיל' },
  { v: 'spacious',    l: 'מרווח' },
]

/* Default preferences blob — used to seed a fresh user. The
   reports sub-tree is owned by useReportsConfig and shaped there;
   we just default to `null` here so the report hook can lift any
   legacy localStorage value on first read. */
export function defaultPreferences() {
  return {
    profile: {
      full_name: '',
      role: 'other',
    },
    format: {
      currency: 'ILS',
      date_format: 'DD/MM/YY',
      time_format: '24h',
      week_start: 'sunday',
    },
    design: {
      theme: 'light',
      text_size: 'normal',
      gender: 'neutral',
    },
    widgets: defaultWidgetsConfig(),
    reports: null,
  }
}

export function defaultWidgetsConfig() {
  return {
    global: {
      cardStyle: 'frosted',
      textStrength: 'normal',
      density: 'comfortable',
    },
    list: WIDGET_REGISTRY.map((w) => ({
      id: w.id,
      enabled: true,
      density: null,            /* null = inherit global */
      accent: w.defaultAccent,
      compact: false,
    })),
  }
}

/* Migrate a partially-shaped or missing prefs blob to current shape.
   Idempotent — safe to call on any input. Drops widget list entries
   whose registry id was removed; auto-appends new registry ids. */
export function migratePreferences(input) {
  const base = defaultPreferences()
  const cur = input && typeof input === 'object' ? input : {}
  const out = {
    profile: { ...base.profile, ...(cur.profile || {}) },
    format:  { ...base.format,  ...(cur.format  || {}) },
    design:  { ...base.design,  ...(cur.design  || {}) },
    widgets: migrateWidgets(cur.widgets),
    reports: cur.reports || null,   /* shaped by useReportsConfig */
  }
  return out
}

function migrateWidgets(input) {
  const base = defaultWidgetsConfig()
  const cur = input && typeof input === 'object' ? input : {}
  const global = { ...base.global, ...(cur.global || {}) }
  const knownIds = new Set(WIDGET_REGISTRY.map((w) => w.id))
  const incoming = Array.isArray(cur.list) ? cur.list : []
  /* Drop unknowns, preserve user order. */
  const filtered = incoming
    .filter((w) => w && knownIds.has(w.id))
    .map((w) => {
      const reg = WIDGET_REGISTRY.find((r) => r.id === w.id)
      const accentIn = w.accent || reg.defaultAccent
      const accent = ACCENT_REMAP[accentIn] || reg.defaultAccent
      return {
        id: w.id,
        enabled: w.enabled !== false,
        density: w.density === undefined ? null : w.density,
        accent,
        compact: !!w.compact,
      }
    })
  /* Auto-append any registry entries the user hasn't seen yet. */
  const have = new Set(filtered.map((w) => w.id))
  WIDGET_REGISTRY.forEach((reg) => {
    if (!have.has(reg.id)) {
      filtered.push({ id: reg.id, enabled: true, density: null, accent: reg.defaultAccent, compact: false })
    }
  })
  return { global, list: filtered }
}
