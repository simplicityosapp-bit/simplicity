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

// Build a categories-ready row from a metric config (name materialized).
export const presetToCategory = (preset) => ({
  key: preset.key,
  icon: preset.icon,
  color: preset.color,
  measurement_type: preset.measurement_type,
  data_source: preset.data_source,
  graph_type: preset.graph_type,
  builtin: preset.builtin,
  name: metricName(preset.key),
})
