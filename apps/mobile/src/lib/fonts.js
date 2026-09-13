// Bundled Alef TTFs (Google Alef, OFL) — the app-wide typeface, matching web
// (the whole web app runs on Alef). Passed to useFonts() in App.js, and applied
// to every piece of text by components/Text.
//
// Applying it used to be a monkey-patch here that wrapped Text.render. React
// Native 0.86's Text and TextInput are plain function components with no
// .render, so on a phone that patch never ran; see components/Text for the
// whole story.
//
// The dual-gender face (AlefMultiGndr-Regular.ttf, still in assets/fonts) is
// NOT loaded, by decision — see the note in @simplicity/core
// domain/multiGender.ts. It was pulled on 2026-07-11 as the prime suspect for
// a release build that closed instantly on launch; the two real causes of
// that crash were found and fixed separately afterwards (Hermes partial Intl,
// and the root registering after native asked for it). Checked on 2026-09-13
// without any font tooling: every table checksum and head.checkSumAdjustment
// is correct and its cmap maps all twelve merge glyphs. Loading it again would
// show the merged letter the way web does instead of the readable slash form —
// a product decision that needs one device boot to confirm, not something to
// flip in passing.
export const fontAssets = {
  Alef: require('../../assets/fonts/Alef-Regular.ttf'),
  'Alef-Bold': require('../../assets/fonts/Alef-Bold.ttf'),
}
