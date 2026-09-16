import i18n from './i18n'

// Goal-category presets (ported from apps/web/src/lib/goalPresets). Each auto
// preset carries the technical config so a non-technical user never sets it;
// display names come from the `presets` i18n namespace (registerPresets). The
// manual "other" metric is a generic bucket. A goal's category is resolved from
// the chosen metric_key — find-or-create (resolveCategoryId in useGoalsData).
export const OTHER_METRIC_KEY = 'other'

const PRESET_CONFIG = [
  { key: 'income', icon: '💰', color: '#0e9888', measurement_type: 'auto', data_source: 'transactions', graph_type: 'delta', builtin: true },
  { key: 'clients_active', icon: '🤝', color: '#8BA888', measurement_type: 'auto', data_source: 'clients_active', graph_type: 'cumulative', builtin: true },
  { key: 'leads_inquiries', icon: '🌱', color: '#D4A574', measurement_type: 'auto', data_source: 'leads_inquiries', graph_type: 'delta', builtin: true },
  { key: 'leads_closings', icon: '✨', color: '#C97B5E', measurement_type: 'auto', data_source: 'leads_closings', graph_type: 'delta', builtin: true },
  { key: 'group_members', icon: '👥', color: '#7C8DB5', measurement_type: 'auto', data_source: 'group_members', graph_type: 'cumulative', builtin: true },
]

export const OTHER_METRIC = { key: OTHER_METRIC_KEY, icon: '📝', color: '#7a5cb8', measurement_type: 'manual', data_source: null, graph_type: 'delta', builtin: false }

// Localized display name: auto presets from presets:category.<key>.name, the
// manual bucket from modalsData:addGoal.otherMetricName.
export const metricName = (key) => (key === OTHER_METRIC_KEY
  ? i18n.t('modalsData:addGoal.otherMetricName')
  : i18n.t(`presets:category.${key}.name`, { defaultValue: key }))

export const CATEGORY_PRESETS = PRESET_CONFIG
// The full metric list for the picker (auto presets + the manual bucket).
export const ALL_METRICS = [...PRESET_CONFIG, OTHER_METRIC]

// Build a categories-ready row from a metric config (name materialized). The
// manual bucket is written with web's name (presets:category.other.name), so a
// row made on the phone reads the same everywhere; the picker keeps its longer
// "אישי — עדכון ידני" label.
const categoryName = (key) => (key === OTHER_METRIC_KEY
  ? i18n.t('presets:category.other.name', { defaultValue: metricName(key) })
  : metricName(key))
export const presetToCategory = (preset) => ({
  key: preset.key,
  icon: preset.icon,
  color: preset.color,
  measurement_type: preset.measurement_type,
  data_source: preset.data_source,
  graph_type: preset.graph_type,
  builtin: preset.builtin,
  name: categoryName(preset.key),
})

/* The account's ONE manual bucket (web lib/goalPresets findManualCategory).
   Rows from before the bucket had a key were written as "אחר" (goals screen)
   or "אישי" (onboarding) — our literals, never user-typed — and still count as
   it. The phone matched the key alone, so an older account that added a
   manual goal here grew a second, identical "personal" group. */
const LEGACY_MANUAL_NAMES = ['אחר', 'אישי']
export const findManualCategory = (categories) =>
  (categories || []).find((c) => c.key === OTHER_METRIC_KEY)
  || (categories || []).find((c) => !c.key && !c.builtin && c.measurement_type === 'manual' && LEGACY_MANUAL_NAMES.includes(c.name))
  || null

/* A chosen metric → a category id, creating the category on first use.
   `insertCategory` is the caller's own write, so its state stays current. */
export async function resolveGoalCategoryId(metricKey, categories, insertCategory) {
  if (metricKey === OTHER_METRIC_KEY) {
    const existing = findManualCategory(categories)
    if (existing) return existing.id
    return (await insertCategory(presetToCategory(OTHER_METRIC))).id
  }
  const preset = CATEGORY_PRESETS.find((p) => p.key === metricKey)
  if (!preset) throw new Error(i18n.t('goals:unknownMetric'))
  const existing = (categories || []).find((c) => c.data_source === preset.data_source)
  if (existing) return existing.id
  return (await insertCategory(presetToCategory(preset))).id
}

/* One goal's own progress entries, newest first (web GoalCard). Every manual
   goal shares a category, so filtering on it listed the whole bucket on each
   card; an entry from before goal_id existed still belongs to the category and
   shows on every goal there — matching how core still scores it. */
export const goalOwnEntries = (entries, goal, cat) => (cat?.measurement_type === 'manual'
  ? (entries || []).filter((e) => (e.goal_id ? e.goal_id === goal.id : e.category_id === cat.id))
    .slice().sort((a, b) => new Date(b.date) - new Date(a.date))
  : [])
