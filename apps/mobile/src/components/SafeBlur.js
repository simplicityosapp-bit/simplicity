import { Platform, View } from 'react-native'
import { BlurView as ExpoBlurView } from 'expo-blur'

// expo-blur's native BlurView is UNVERIFIED on Android devices and is the leading
// suspect for the native instant-close on launch (a native-view crash the JS
// layer can't catch). On Android its blur is also effectively a no-op without
// `experimentalBlurMethod`, so nothing is lost: fall back to a plain transparent
// View there — every caller layers a cream veil View on top, which still gives the
// frosted-glass look. iOS (and web) keep the real blur.
export function BlurView({ intensity, tint, ...rest }) {
  if (Platform.OS === 'android') return <View {...rest} />
  return <ExpoBlurView intensity={intensity} tint={tint} {...rest} />
}
