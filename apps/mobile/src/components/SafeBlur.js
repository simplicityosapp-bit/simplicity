import { Platform, View } from 'react-native'
import { BlurView as ExpoBlurView } from 'expo-blur'

/* expo-blur's native BlurView is UNVERIFIED on Android devices and was the
   leading suspect for the native instant-close on launch (a native abort the JS
   layer cannot catch) — see 598a5c73, which disabled it. That was a guess, and
   nothing since has confirmed or cleared it; the app does launch with the
   fallback in place. Re-enabling it, even with `experimentalBlurMethod`, bets
   the app's launch on an untested hunch, so it stays off.

   What the fallback owed and did not pay: the callers' own veils are tuned to
   sit OVER a blur, so alone they leave the background sharp and legible through
   the panel — 0.74 alpha on the drawer, 0.34 on small glass chrome. That is the
   "opens with no blur" report. A plain transparent View was never going to look
   frosted.

   So the Android branch now IS the frost: one veil, at the single point all five
   consumers already pass through, composited under whatever veil each of them
   adds. iOS and web keep the real blur and are untouched.

   TUNING: these two constants are the whole knob. Raise them toward 1 for a more
   solid panel, lower them for more of the background. Nothing else needs to
   change, and no caller needs to know. */
const ANDROID_VEIL_LIGHT = 'rgba(255,252,247,0.45)'
const ANDROID_VEIL_DARK = 'rgba(20,24,29,0.45)'

export function BlurView({ intensity, tint, style, ...rest }) {
  if (Platform.OS === 'android') {
    const veil = tint === 'dark' ? ANDROID_VEIL_DARK : ANDROID_VEIL_LIGHT
    return <View {...rest} style={[style, { backgroundColor: veil }]} />
  }
  return <ExpoBlurView intensity={intensity} tint={tint} style={style} {...rest} />
}
