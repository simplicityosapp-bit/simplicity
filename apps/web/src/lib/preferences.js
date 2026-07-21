/* ════════════════════════════════════════════════════════════════
   PREFERENCES SHAPE — default values + migration.
   ════════════════════════════════════════════════════════════════
   The user_preferences.preferences JSONB blob carries everything:
   profile, format, design, widgets. Reports config still lives in
   localStorage (mg-reports-config) — will be migrated here later.
   ════════════════════════════════════════════════════════════════ */

import i18n from '@simplicity/core/i18n'

/* Registry of home widgets. Order here = default order. Each widget
   in DEFAULT_WIDGETS.list mirrors registry entries. Display names resolve
   via i18n at the call site (settings:widgets.names.<id>) so they follow
   the active language; the registry stays language-agnostic. */
export const WIDGET_REGISTRY = [
  { id: 'quote',           defaultAccent: 'blush',      supportsCompact: false },
  { id: 'moon',            defaultAccent: 'sage',       supportsCompact: true },
  { id: 'insights',        defaultAccent: 'sage',       supportsCompact: false },
  { id: 'quick-row',       defaultAccent: 'terracotta', supportsCompact: false },
  { id: 'attention',       defaultAccent: 'amber',      supportsCompact: true },
  { id: 'next-tasks',      defaultAccent: 'terracotta', supportsCompact: false },
  { id: 'chips',           defaultAccent: 'sage',       supportsCompact: false },
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

/* Role labels. Entries that inflect for gender are stored as
   {male,female,neutral} variants and resolved via roleLabel(key, gender);
   gender-invariant roles (מנחה, מורה, אחר) stay plain strings. */
export const ROLE_LABELS = {
  therapist:   { male: 'מטפל',  female: 'מטפלת', neutral: 'מטפל/ת' },
  coach:       { male: 'מאמן',  female: 'מאמנת', neutral: 'מאמן/ת' },
  facilitator: 'מנחה',
  teacher:     'מורה',
  instructor:  { male: 'מדריך', female: 'מדריכה', neutral: 'מדריך/ה' },
  other:       'אחר',
}

/* Resolve a role key to its label for the given form of address, via i18n
   (common:roles.*). Gender male/female → the gendered variant; anything else
   → the neutral base. Callers are unchanged (still pass key + gender). */
export function roleLabel(key, gender) {
  if (!key) return ''
  const context = gender === 'male' || gender === 'female' ? gender : undefined
  return i18n.t('common:roles.' + key, { context })
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
      role_other: '',           /* when role==='other', the free-text custom value */
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
      /* UI language. null = follow the local choice (i18next/localStorage,
         default Hebrew); set to a code ('he'|'en'|'es'|'fr') once the user
         picks one, so it syncs across devices via <I18nSync/>. */
      language: null,
      /* Background mode (applied to <html data-bg> by PrefsApplier):
         'nature' = the per-screen nature photos (default — existing users
         migrate to this with no visual change), 'simple' = the Reports
         background on every screen, 'blank' = no image, a flat soft-cream
         surface (inverts in dark mode). See src/index.css [data-bg] rules. */
      background: 'nature',
    },
    widgets: defaultWidgetsConfig(),
    reports: null,
    onboarding: defaultOnboarding(),
    /* First-touch coachmarks. Map of coachmark id → true once the user
       has interacted with that button. Empty/absent map = every button
       is still "virgin" and should glow — so existing users (who lack a
       `coachmarks` key) see the guidance too, with no migration. */
    coachmarks: {},
    /* Guided screen tours. Map of screen key → true once the multi-step
       spotlight tour for that screen has been seen (or skipped). Absent =
       not seen yet, so the tour auto-runs on first visit. No migration. */
    tours: {},
    /* Account-deletion request (30-day grace). null = no pending deletion.
       When set: { requested_at, scheduled_for } (ISO). Preserved across
       loads by the `...cur` spread in migratePreferences — no migration. */
    accountDeletion: null,
    /* WhatsApp click-to-chat message templates the coach can customise
       (edited in /connections/whatsapp). Empty string per key = fall back
       to the built-in i18n default. Stored in this JSONB blob, so no
       schema migration. See lib/whatsapp.js fillTemplate(). */
    whatsapp: defaultWhatsApp(),
  }
}

/* Default WhatsApp message templates — one per send surface. Empty = the
   surface uses its built-in localized default. Placeholders use {{token}}
   syntax (name / date / time / number / url), filled per surface. */
export function defaultWhatsApp() {
  return {
    templates: { client: '', reminder: '', meeting: '', receipt: '', lead: '', payment: '' },
  }
}

/* 9-step welcome flow. `step` is the key currently shown; `completed_at`
   releases the AuthGate to /home. `answers` carries per-step inputs so
   the user can resume mid-flow (e.g. closed tab). `parsed_data` is the
   raw CSV-parse output when the user picked path A; cleared on finish. */
export const ONBOARDING_STEPS = [
  'profile',
  'data_import',
  'projects',
  'clients',
  'daily_questions',
  'goals',
  'recurring',
  'preview',
  'finish',
]

export function defaultOnboarding() {
  return {
    version: 1,
    step: 'profile',
    welcome_seen: false,         /* pre-flow gate: shows the logo + 2-card chooser until acknowledged */
    completed_at: null,
    skipped_at: null,           /* user fully skipped the flow — still released to home */
    started_at: null,
    answers: {
      profile:         { name: '', role: null },
      data_import:     { mode: null, file_name: null, parsed_at: null },
      projects:        { created_ids: [], group_mode: null },
      clients:         { created_ids: [] },
      daily_questions: { question_ids: [], custom_text: '' },
      goals:           { created_ids: [], income_goal_amount: null },
      recurring:       { created_ids: [] },
    },
    completed_steps: [],         /* keys of steps the user actually filled (not skipped) — drives the tree growth */
    parsed_data: null,
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
    /* Preserve any extra top-level prefs the app persists outside the
       structured shape (insightsReminder, leadsView, financeShowSkipped,
       tileFilters, …). Without this spread the whitelist below silently
       dropped them on every load, so the saved value never came back. */
    ...cur,
    profile: { ...base.profile, ...(cur.profile || {}) },
    format:  { ...base.format,  ...(cur.format  || {}) },
    design:  { ...base.design,  ...(cur.design  || {}) },
    widgets: migrateWidgets(cur.widgets),
    reports: cur.reports || null,   /* shaped by useReportsConfig */
    onboarding: migrateOnboarding(cur.onboarding),
    coachmarks: (cur.coachmarks && typeof cur.coachmarks === 'object' && !Array.isArray(cur.coachmarks))
      ? cur.coachmarks
      : {},
    tours: (cur.tours && typeof cur.tours === 'object' && !Array.isArray(cur.tours))
      ? cur.tours
      : {},
    whatsapp: migrateWhatsApp(cur.whatsapp),
  }
  return out
}

function migrateWhatsApp(input) {
  const base = defaultWhatsApp()
  const cur = input && typeof input === 'object' ? input : {}
  return { templates: { ...base.templates, ...(cur.templates || {}) } }
}

function migrateOnboarding(input) {
  const base = defaultOnboarding()
  if (!input || typeof input !== 'object') return base
  return {
    ...base,
    ...input,
    answers: { ...base.answers, ...(input.answers || {}) },
    completed_steps: Array.isArray(input.completed_steps) ? input.completed_steps : [],
  }
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
