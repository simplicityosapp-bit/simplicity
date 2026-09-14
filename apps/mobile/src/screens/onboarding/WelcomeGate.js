import { useRef, useState } from 'react'
import { View, I18nManager } from 'react-native'
import { Text } from '../../components/Text'
import { Pressable } from '../../components/Pressable'
import { Image } from 'expo-image'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import { colors, radius, space, type } from '../../theme/theme'
import { themed } from '../../theme/themed'
import i18n from '../../lib/i18n'
import Screen from '../../components/Screen'

/* Pre-flow welcome — shown once before the five-step flow. Two ways on:
   start the introduction, or go straight into the app. Either choice flips
   onboarding.welcome_seen so the gate does not replay, including when the
   user comes back through Settings and restarts the introduction.

   Mirrors apps/web WelcomeGate: same two options, same copy keys, so a
   user who sees this on a phone and then on a laptop reads the same words.

   RTL: the app is Hebrew-first but I18nManager.forceRTL only applies after
   an app reload, so the arrow is chosen from the language rather than from
   isRTL — the same approach ScreenHead and BottomBar already take. */
export default function WelcomeGate({ onStart, onSkip }) {
  const rtl = (i18n.language || '').startsWith('he')
  const Arrow = rtl ? ChevronLeft : ChevronRight
  const align = { textAlign: rtl ? 'right' : 'left' }

  /* Both paths are two sequential writes with nothing between them to stop
     a second press, and neither button changes on the first — so on a slow
     connection pressing again looks like the only thing to do. The ref
     flips synchronously (state would not, before the re-render) and `busy`
     disables both so the press has somewhere to land. Same pairing web
     uses. */
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const once = (fn) => async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      busyRef.current = false
      setBusy(false)
      throw e
    }
  }

  const t = (k) => i18n.t('onboarding:' + k)

  const Option = ({ onPress, title, sub, primary }) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.option,
        primary ? styles.optionPrimary : styles.optionGhost,
        (pressed || busy) && styles.optionPressed,
      ]}
    >
      <View style={styles.optionText}>
        <Text style={[styles.optionTitle, primary && styles.onPrimary, align]}>{title}</Text>
        <Text style={[styles.optionSub, primary && styles.onPrimarySub, align]}>{sub}</Text>
      </View>
      <Arrow size={18} strokeWidth={1.8} color={primary ? colors.onBtn : colors.brand} />
    </Pressable>
  )

  return (
    <Screen name="home">
      <View style={styles.root}>
        <Image
          source={require('../../../assets/logo.png')}
          style={styles.logo}
          contentFit="contain"
          transition={200}
        />
        <Text style={styles.name}>Simplicity</Text>
        <Text style={styles.tag}>{t('welcome.tagline')}</Text>

        <View style={styles.options}>
          <Option
            primary
            onPress={once(onStart)}
            title={t('welcome.startTitle')}
            sub={t('welcome.startSub')}
          />
          <Option
            onPress={once(onSkip)}
            title={t('welcome.skipTitle')}
            sub={t('welcome.skipSub')}
          />
        </View>
      </View>
    </Screen>
  )
}

const styles = themed((c, t) => ({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: space.screenPadH,
    gap: 6,
  },
  logo: { width: 72, height: 72, alignSelf: 'center', marginBottom: 10 },
  name: { ...t.displayL, color: c.text, textAlign: 'center' },
  tag: { ...t.caption, color: c.textSub, textAlign: 'center', marginBottom: 26 },
  options: { gap: 12 },
  option: {
    flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.card,
    paddingVertical: space.cardPadV,
    paddingHorizontal: space.cardPadH,
    borderWidth: 1,
  },
  optionPrimary: { backgroundColor: c.btnBg, borderColor: c.btnBg },
  optionGhost: { backgroundColor: c.card, borderColor: c.border },
  optionPressed: { opacity: 0.75 },
  optionText: { flex: 1, gap: 3 },
  optionTitle: { ...t.heading, color: c.text },
  optionSub: { ...t.caption, color: c.textSub },
  onPrimary: { color: c.onBtn },
  onPrimarySub: { color: c.onBtn, opacity: 0.85 },
}))
