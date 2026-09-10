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

/* And the other half of the same silence: `disabled`.
   ────────────────────────────────────────────────────────────────
   Fifty-two of the eighty-seven controls that take a `disabled` prop
   changed nothing about how they looked when it was set. Most take it
   from a `busy` flag during a save — so the button stopped responding at
   exactly the moment the user was waiting on it, and looked no different
   while it did. With the missing press feedback that was two silences in
   a row: the tap says nothing, then the button says nothing.

   0.45 is the value the thirty-five that DID dim already used (0.4-0.5,
   most often 0.45). Style flattening means the last opacity wins rather
   than multiplying, so those keep the look they have instead of dimming
   twice — their own rules become redundant, not compounding. Sites whose
   disabled state is a colour rather than an opacity compose with this
   cleanly, since they set a different property. */
const DISABLED_OPACITY = 0.45

/* Exported for its own test. RN resolves the style function inside
   Pressable, so the composition — the part that can silently swallow a
   caller's appearance — is only reachable from the outside as this.

   `disabled` dims only when there is an onPress to disable. Not every
   `disabled` in this app means "temporarily unavailable": the calendar
   marks an agenda row that has no detail view to open, and settings
   marks a chip in a list that is read-only here. Those rows are CONTENT
   — dimming them to 45% is dimming the thing the user came to read, and
   it is the shape a blanket rule gets wrong. A control with no handler
   was never a button, so there is nothing to grey out. */
export function composePressedStyle(style, state, disabled, pressable = true) {
  const base = typeof style === 'function' ? style(state) : style
  if (disabled) return pressable ? [base, styles.disabled] : base
  return state.pressed ? [base, styles.pressed] : base
}

/* What a screen reader is told this thing is.
   ────────────────────────────────────────────────────────────────
   Forty of the app's three hundred and sixty-four controls named a
   role. The rest arrived at VoiceOver and TalkBack as text: every row
   in the "עוד" drawer, "התנתקות" among them, announced as a label with
   nothing to say it can be activated.

   Anything that takes a press IS a button unless it says otherwise, so
   that is the default — and a caller that knows better (a checkbox, a
   switch, a tab, a link) keeps what it passed. Only `onPress` counts:
   a Pressable used purely as a layout wrapper should not claim to be
   something you can press.

   Labels are the other half and cannot be defaulted — RN already reads
   a control's own <Text> when there is one, so what is left unnamed is
   the icon-only controls, and each of those needs a word chosen for it.
   Fixed here where the shared chrome could be reached; the per-screen
   ones are still open. */
export function Pressable({ style, disabled, accessibilityRole, onPress, ...rest }) {
  return (
    <RNPressable
      {...rest}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={accessibilityRole || (onPress ? 'button' : undefined)}
      style={(state) => composePressedStyle(style, state, disabled, !!onPress)}
    />
  )
}

const styles = StyleSheet.create({
  pressed: { opacity: PRESSED_OPACITY },
  disabled: { opacity: DISABLED_OPACITY },
})

export default Pressable
