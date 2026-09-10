import { Pressable as RNPressable, StyleSheet } from 'react-native'

/* Pressable, but it answers you.
   ────────────────────────────────────────────────────────────────
   RN's <Pressable> has NO built-in feedback — that was the trade when it
   replaced <TouchableOpacity>, which dimmed on its own. This app has 364
   of them and, until this file, not one gave any sign a touch had landed:
   no ripple, no dim, nothing. Between the tap and whatever comes next —
   a network round-trip, a navigation, a save — the screen simply sat
   there, which is the same thing a dead button looks like. It is the
   likeliest source of "I pressed it and nothing happened", and of the
   double taps that follow.

   A shim rather than 364 edits: every file that used to pull Pressable
   out of 'react-native' pulls it out of here instead, one import line
   each, and every call site inside gets the behaviour without being
   touched. Props pass straight through, and a caller that wants to
   decide for itself can still hand `style` a function — its result is
   composed with the dim rather than replaced by it.

   Opacity, and deliberately not android_ripple. A ripple is the more
   native Android answer, but it needs a per-call-site decision — a
   radius to clip to, or `borderless` — and an unclipped ripple paints a
   square through a rounded card. Ripples do not exist on
   react-native-web, so none of those 364 decisions could be checked
   without a device, and a dim that is right everywhere beats a ripple
   that is wrong in places nobody can see. Worth revisiting on hardware.

   RN skips `pressed` entirely while `disabled` is set, so a disabled
   control stays still on touch — which is what it should do. */

const PRESSED_OPACITY = 0.62

/* Exported for its own test. RN resolves the style function inside
   Pressable, so the composition — the part that can silently swallow a
   caller's appearance — is only reachable from the outside as this. */
export function composePressedStyle(style, state) {
  const base = typeof style === 'function' ? style(state) : style
  return state.pressed ? [base, styles.pressed] : base
}

export function Pressable({ style, ...rest }) {
  return <RNPressable {...rest} style={(state) => composePressedStyle(style, state)} />
}

const styles = StyleSheet.create({
  pressed: { opacity: PRESSED_OPACITY },
})

export default Pressable
