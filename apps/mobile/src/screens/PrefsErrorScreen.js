import { View } from 'react-native'
import { Text } from '../components/Text'
import { Pressable } from '../components/Pressable'
import i18n from '../lib/i18n'
import { themed } from '../theme/themed'

/* Shown when the preferences read FAILED (mirrors web App.jsx's prefs-error
   screen). Letting the user through instead — what this app used to do — is
   not a gentle failure: with no preferences known an existing account reads
   as a brand-new one, and the first setting touched is saved over the whole
   preferences row. A retry costs one tap. */
export default function PrefsErrorScreen({ onRetry }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.msg}>{i18n.t('components:prefsLoad.message')}</Text>
      <Pressable style={styles.btn} onPress={onRetry} accessibilityRole="button">
        <Text style={styles.btnText}>{i18n.t('common:tryAgain')}</Text>
      </Pressable>
    </View>
  )
}

const styles = themed((c) => ({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: c.bg },
  msg: { fontSize: 15, lineHeight: 24, color: c.text, textAlign: 'center', maxWidth: 360 },
  btn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, backgroundColor: c.btnBg },
  btnText: { fontSize: 15, fontWeight: '600', color: c.onBtn },
}))
