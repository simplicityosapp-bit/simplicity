import { Text, TextInput, StyleSheet } from 'react-native'

// Bundled Alef TTFs (Google Alef, OFL) — the app-wide typeface, matching web
// (the whole web app runs on Alef). Passed to useFonts() in App.js.
// NOTE: web additionally scopes Heebo to digits and AlefMG to the 12 dual-gender
// glyphs via CSS `unicode-range`, which RN can't express with a single
// fontFamily — so digits render in Alef and the dual-gender codepoints fall back
// to the device font until a merged .ttf is bundled. (See owner decision.)
export const fontAssets = {
  Alef: require('../../assets/fonts/Alef-Regular.ttf'),
  'Alef-Bold': require('../../assets/fonts/Alef-Bold.ttf'),
}

const isBold = (w) => w === 'bold' || w === '600' || w === '700' || w === 600 || w === 700

// Make Alef the app-wide base font. We rewrite `props.style` BEFORE the original
// forwardRef render runs (Text/TextInput are `forwardRef((props, ref) => …)` on
// both native and react-native-web) — patching the OUTPUT fails on RNW because a
// top-level Text render returns a Context.Provider, not the styled node. Alef is
// prepended (FIRST) so any explicit fontFamily in a component's own style still
// wins; weights >=600 use the Alef Bold face (fontWeight reset to avoid faux
// double-bold). Runs once at import, before the first Text renders.
function patch(Comp) {
  if (!Comp || Comp.__alefPatched) return
  const orig = Comp.render
  if (typeof orig !== 'function') return
  Comp.__alefPatched = true
  Comp.render = function render(props, ref) {
    const flat = StyleSheet.flatten(props.style) || {}
    const bold = isBold(flat.fontWeight)
    const style = bold
      ? [{ fontFamily: 'Alef-Bold' }, props.style, { fontWeight: 'normal' }]
      : [{ fontFamily: 'Alef' }, props.style]
    return orig.call(this, { ...props, style }, ref)
  }
}

patch(Text)
patch(TextInput)
