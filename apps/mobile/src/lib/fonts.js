import { Text, TextInput, StyleSheet } from 'react-native'

// Bundled Alef TTFs (Google Alef, OFL) — the app-wide typeface, matching web
// (the whole web app runs on Alef). Passed to useFonts() in App.js.
// The regular face is AlefMultiGndr (Alef + the dual-gender glyphs, incl. the
// U+05CC mark) so those codepoints render correctly instead of falling back to
// the device font. Web scopes AlefMG to them via CSS `unicode-range` (which RN
// can't do per-glyph), but AlefMG is a superset of Alef — verified: digits, ₪,
// U+05CC all present — so it works as the base face. Bold stays standard
// Alef-Bold (no dual-gender bold cut exists; bold + U+05CC is rare). The .ttf was
// converted from the web .woff via scratchpad/woff2ttf.js (WOFF1 = zlib SFNT).
export const fontAssets = {
  Alef: require('../../assets/fonts/AlefMultiGndr-Regular.ttf'),
  'Alef-Bold': require('../../assets/fonts/Alef-Bold.ttf'),
}

const isBold = (w) => w === 'bold' || w === '600' || w === '700' || w === 600 || w === 700

// The dual-gender combining mark. It only exists in AlefMultiGndr ('Alef'), NOT in
// Alef-Bold — so a BOLD label that contains it (e.g. the neutral status "פעיל׌")
// would render a tofu box. When present, fall back to the dual-gender face and
// let the platform faux-bold it (same as web, where AlefMG has no bold cut and the
// browser synthesises bold for that glyph). Rare, so the crisp real Alef-Bold
// still serves every other bold string.
const DG_MARK = '׌'
function hasDualGender(c) {
  if (typeof c === 'string') return c.indexOf(DG_MARK) >= 0
  if (Array.isArray(c)) return c.some(hasDualGender)
  return false
}

// Make Alef the app-wide base font. We rewrite `props.style` BEFORE the original
// forwardRef render runs (Text/TextInput are `forwardRef((props, ref) => …)` on
// both native and react-native-web) — patching the OUTPUT fails on RNW because a
// top-level Text render returns a Context.Provider, not the styled node. Alef is
// prepended (FIRST) so any explicit fontFamily in a component's own style still
// wins; weights >=600 use the Alef Bold face (fontWeight reset to avoid faux
// double-bold) — EXCEPT bold strings carrying the dual-gender mark, which keep the
// dual-gender face + faux bold so the glyph renders. Runs once at import.
function patch(Comp) {
  if (!Comp || Comp.__alefPatched) return
  const orig = Comp.render
  if (typeof orig !== 'function') return
  Comp.__alefPatched = true
  Comp.render = function render(props, ref) {
    const flat = StyleSheet.flatten(props.style) || {}
    const bold = isBold(flat.fontWeight)
    // Text carries content in `children`; TextInput in `value`/`defaultValue`.
    const dg = hasDualGender(props.children)
      || (typeof props.value === 'string' && props.value.indexOf(DG_MARK) >= 0)
      || (typeof props.defaultValue === 'string' && props.defaultValue.indexOf(DG_MARK) >= 0)
    const style = (bold && !dg)
      ? [{ fontFamily: 'Alef-Bold' }, props.style, { fontWeight: 'normal' }]
      : [{ fontFamily: 'Alef' }, props.style]
    return orig.call(this, { ...props, style }, ref)
  }
}

patch(Text)
patch(TextInput)
