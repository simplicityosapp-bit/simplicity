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
