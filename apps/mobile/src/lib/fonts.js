// Bundled Alef TTFs (Google Alef, OFL) — the app-wide typeface, matching web
// (the whole web app runs on Alef). Passed to useFonts() in App.js, and applied
// to every piece of text by components/Text.
//
// Applying it used to be a monkey-patch here that wrapped Text.render. React
// Native 0.86's Text and TextInput are plain function components with no
// .render, so on a phone that patch never ran; see components/Text.
//
// The regular face is AlefMultiGndr: Alef plus the twelve dual-gender merge
// glyphs on unassigned Hebrew-block codepoints ("פעיל׌" = פעיל and פעילה in
// one word). It was loaded once before, on 2026-07-08, and pulled on
// 2026-07-11 as the prime suspect for a release build that closed instantly
// on launch. The two real causes of that crash were found and fixed later
// (Hermes partial Intl, and the root registering after native asked for it).
// Checked on 2026-09-13 without any font tooling: every table checksum and
// head.checkSumAdjustment is correct, and its cmap maps all twelve merge
// glyphs plus Hebrew letters, digits and ₪ — a superset of Alef-Regular. The
// owner chose to load it again the same day.
//
// Bold stays the real Alef-Bold, which has no merge glyphs; components/Text
// keeps a bold string that carries one on this regular face and lets the
// platform synthesise the bold, the way a browser does for web's AlefMG.
//
// IF A DEVICE BUILD CLOSES ON LAUNCH: set MERGE_FONT_LOADED to false and point
// Alef back at Alef-Regular.ttf. components/Text then shows the readable slash
// form ("פעיל/ה") instead of the glyph, and nothing else needs to change.
export const MERGE_FONT_LOADED = true

export const fontAssets = {
  Alef: MERGE_FONT_LOADED
    ? require('../../assets/fonts/AlefMultiGndr-Regular.ttf')
    : require('../../assets/fonts/Alef-Regular.ttf'),
  'Alef-Bold': require('../../assets/fonts/Alef-Bold.ttf'),
}
