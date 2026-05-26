/* ════════════════════════════════════════════════════════════════
   GOAL CATEGORY PRESETS — one-tap "auto" categories.
   ════════════════════════════════════════════════════════════════
   No builtins are seeded; the user adds these on demand. Each carries
   the technical config (measurement_type / data_source / graph_type)
   so a non-technical user never has to set it. Custom (manual)
   categories are created via AddGoalCategoryModal instead.
   ════════════════════════════════════════════════════════════════ */

export const CATEGORY_PRESETS = [
  {
    key: 'income',
    name: 'הכנסות',
    icon: '💰',
    color: '#0e9888',
    measurement_type: 'auto',
    data_source: 'transactions',
    graph_type: 'delta',
    builtin: true,
    hint: 'מתעדכן אוטומטית מהתנועות',
  },
  {
    key: 'clients_active',
    name: 'לקוחות פעילים',
    icon: '🤝',
    color: '#8BA888',
    measurement_type: 'auto',
    data_source: 'clients_active',
    graph_type: 'cumulative',
    builtin: true,
    hint: 'נספר אוטומטית מהלקוחות',
  },
  {
    key: 'leads_inquiries',
    name: 'פניות',
    icon: '🌱',
    color: '#D4A574',
    measurement_type: 'auto',
    data_source: 'leads_inquiries',
    graph_type: 'delta',
    builtin: true,
    hint: 'נספר אוטומטית מהלידים',
  },
  {
    key: 'leads_closings',
    name: 'סגירות',
    icon: '✨',
    color: '#C97B5E',
    measurement_type: 'auto',
    data_source: 'leads_closings',
    graph_type: 'delta',
    builtin: true,
    hint: 'לידים שהומרו ללקוחות',
  },
]

/* Strip the UI-only `hint` before sending to Supabase. */
export const presetToCategory = (preset) => {
  const row = { ...preset }
  delete row.hint
  return row
}
