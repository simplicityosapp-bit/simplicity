// Shared data-viz / category color palette.
//
// These are the swatches offered in every color picker (projects, groups, goal
// categories, task taxonomy, onboarding project step). They are stored on the
// row as a hex string, so the VALUES must stay stable — this module only removes
// the duplication of the same array across ~8 files (single source of truth).
//
// The eight hues correspond to the design tokens teal / cyan / purple / sage /
// terracotta / amber-warn / clay / green. They are a *data-viz* palette (they
// distinguish categories/series), NOT chrome — do not collapse to one token.
export const CATEGORY_SWATCHES = [
  '#0e9888', // teal
  '#0099aa', // cyan
  '#7a5cb8', // purple
  '#8BA888', // sage
  '#C97B5E', // terracotta
  '#D4A574', // amber-warn
  '#B5634E', // clay
  '#4a9a6a', // green
]

/* ── Naming a swatch ──────────────────────────────────────────────
   Every colour picker in the app rendered `aria-label={c}`, so a screen
   reader announced the raw hex — "number 0 e 9 8 8 8" — for each of the
   eight buttons. This maps a swatch to a stable key so the label can be a
   colour NAME, translated like everything else.

   Keyed by hex rather than by index: the array order is a layout decision
   and a reorder must not silently rename every colour. An unknown value
   (an old row, a colour picked before this list settled) returns null, and
   callers fall back to the hex — an odd label beats a wrong one. */
const SWATCH_KEYS = {
  /* CATEGORY_SWATCHES — project / group / goal-category pickers. */
  '#0e9888': 'teal',
  '#0099aa': 'cyan',
  '#7a5cb8': 'purple',
  '#8BA888': 'sage',
  '#C97B5E': 'terracotta',
  '#D4A574': 'amber',
  '#B5634E': 'clay',
  '#4a9a6a': 'green',
  /* CATEGORY_COLORS (lib/api/categories) — the lead-source picker draws
     from a different list that happens to serve the same control. Both
     belong here so one lookup covers every swatch in the app. */
  '#00c878': 'emerald',
  '#0099cc': 'azure',
  '#d07040': 'orange',
  '#8855cc': 'purple',
  '#e05560': 'coral',
  '#c8a040': 'gold',
  '#00aaaa': 'teal',
  '#cc5588': 'pink',
}

export function swatchKey(hex) {
  return SWATCH_KEYS[hex] || SWATCH_KEYS[String(hex).toUpperCase()]
    || SWATCH_KEYS[String(hex).toLowerCase()] || null
}
