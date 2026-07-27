/* ════════════════════════════════════════════════════════════════
   GOAL CATEGORY PRESETS — one-tap "auto" categories.
   ════════════════════════════════════════════════════════════════
   CANONICAL: these defaults ARE seeded once per account on first visit to
   Goals (goals/index.jsx, guarded by prefs.goalsSeeded) so a new user lands
   on a ready board. Each carries the technical config (measurement_type /
   data_source / graph_type) so a non-technical user never has to set it.
   Custom (manual) categories are created via AddGoalCategoryModal instead.

   i18n: display strings (name/hint) live in i18n (namespace 'presets',
   presets:category.<key>.name / .hint) and follow the active language.
   The objects expose `name`/`hint` as live getters so existing consumers
   that read `.name`/`.hint` translate at read-time with no churn; the
   spread in presetToCategory() captures the current-language value for the
   row written to Supabase. The 'presets' bundle is self-registered below so
   this lib needs no change to src/i18n/index.js.
   ════════════════════════════════════════════════════════════════ */
import i18n from '@simplicity/core/i18n'
import hePresets from '../i18n/locales/he/presets.json'
import enPresets from '../i18n/locales/en/presets.json'
import esPresets from '../i18n/locales/es/presets.json'
import frPresets from '../i18n/locales/fr/presets.json'

/* Self-register the 'presets' namespace (idempotent — addResourceBundle with
   deep+overwrite false is a no-op if already present), so consumers resolve
   presets:category.* without touching the central i18n init. */
i18n.addResourceBundle('he', 'presets', hePresets, true, false)
i18n.addResourceBundle('en', 'presets', enPresets, true, false)
i18n.addResourceBundle('es', 'presets', esPresets, true, false)
i18n.addResourceBundle('fr', 'presets', frPresets, true, false)

export const presetName = (key) => i18n.t(`presets:category.${key}.name`)
export const presetHint = (key) => i18n.t(`presets:category.${key}.hint`)

/* Stable technical config per preset (no display strings). name/hint are
   layered on as live getters below so reads always reflect the active lang. */
const PRESET_CONFIG = [
  {
    key: 'income',
    icon: '💰',
    color: '#0e9888',
    measurement_type: 'auto',
    data_source: 'transactions',
    graph_type: 'delta',
    builtin: true,
  },
  {
    key: 'clients_active',
    icon: '🤝',
    color: '#8BA888',
    measurement_type: 'auto',
    data_source: 'clients_active',
    graph_type: 'cumulative',
    builtin: true,
  },
  {
    key: 'leads_inquiries',
    icon: '🌱',
    color: '#D4A574',
    measurement_type: 'auto',
    data_source: 'leads_inquiries',
    graph_type: 'delta',
    builtin: true,
  },
  {
    key: 'leads_closings',
    icon: '✨',
    color: '#C97B5E',
    measurement_type: 'auto',
    data_source: 'leads_closings',
    graph_type: 'delta',
    builtin: true,
  },
  {
    key: 'group_members',
    icon: '👥',
    color: '#7C8DB5',
    measurement_type: 'auto',
    data_source: 'group_members',
    graph_type: 'cumulative',
    builtin: true,
  },
]

/* Each preset exposes `name`/`hint` as enumerable getters resolving via i18n
   in the active language. Getters are enumerable so {...preset} (spread)
   materialises them into plain strings for the Supabase row. */
export const CATEGORY_PRESETS = PRESET_CONFIG.map((cfg) =>
  Object.defineProperties({ ...cfg }, {
    name: { enumerable: true, get() { return presetName(cfg.key) } },
    hint: { enumerable: true, get() { return presetHint(cfg.key) } },
  }),
)

/* Strip the UI-only `hint` before sending to Supabase. Spreading first
   materialises the `name`/`hint` getters into the active-language strings. */
export const presetToCategory = (preset) => {
  const row = { ...preset }
  delete row.hint
  return row
}

/* ── The shared manual bucket ────────────────────────────────────────
   Every goal that isn't one of the auto metrics lands here, so the user
   never has to manage metrics. It is ONE bucket for the whole app: the
   goals screen and onboarding used to each create their own ("אחר" with
   key 'other', and "אישי" with no key at all), which left a user who set
   a personal goal during onboarding and another one later looking at two
   identical manual groups on their board. Both now resolve through here.

   `name` is a getter, like the presets above, so the row written to
   Supabase carries the user's own language instead of a hardcoded word. */
export const MANUAL_CATEGORY_KEY = 'other'

export const MANUAL_CATEGORY = Object.defineProperties({
  key: MANUAL_CATEGORY_KEY,
  icon: '📝',
  color: '#7a5cb8',
  measurement_type: 'manual',
  data_source: null,
  graph_type: 'delta',
  builtin: false,
}, {
  name: { enumerable: true, get() { return presetName(MANUAL_CATEGORY_KEY) } },
  hint: { enumerable: true, get() { return presetHint(MANUAL_CATEGORY_KEY) } },
})

/* Names the two pre-unification buckets were created with. Matched so an
   existing account keeps using the row it already has rather than growing
   a third one — these are OUR old literals, never user-typed names. */
const LEGACY_MANUAL_NAMES = ['אחר', 'אישי']

/* The user's existing manual bucket, or null if they have none yet. */
export const findManualCategory = (categories) =>
  (categories || []).find((c) => c.key === MANUAL_CATEGORY_KEY)
  || (categories || []).find((c) => !c.key && !c.builtin && c.measurement_type === 'manual' && LEGACY_MANUAL_NAMES.includes(c.name))
  || null

/* Find-or-create, returning the category id. `addCategory` is the caller's
   own hook mutation so the query cache stays theirs. */
export async function resolveManualCategoryId(categories, addCategory) {
  const existing = findManualCategory(categories)
  if (existing) return existing.id
  const created = await addCategory(presetToCategory(MANUAL_CATEGORY))
  return created.id
}
