import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { RefreshCw } from 'lucide-react-native'
import { Text } from './Text'
import { Pressable } from './Pressable'
import { supabase } from '../lib/supabase'
import { translateAuthError } from '../lib/authErrors'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'

/* Supabase rate-limits confirmation mail per address — one a minute by
   default — so the wait is counted down out loud: a button that silently
   refuses looks like a button that does not work. */
const COOLDOWN_SECONDS = 60
const t = (k, o) => i18n.t(`auth:resend.${k}`, o)

/* "Send that confirmation email again" — port of web's ResendConfirmation.
   Shown where someone gets stuck waiting for one: straight after signing up,
   and on login when the answer is "confirm your email first", which on the
   phone was a wall with no door in it.

   Says nothing about whether the address is registered: Supabase answers
   the same way either way (email-enumeration protection), and so does this. */
export default function ResendConfirmation({ email }) {
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [left, setLeft] = useState(0)
  const timer = useRef(null)

  useEffect(() => () => clearInterval(timer.current), [])

  const startCooldown = () => {
    setLeft(COOLDOWN_SECONDS)
    clearInterval(timer.current)
    timer.current = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) { clearInterval(timer.current); return 0 }
        return s - 1
      })
    }, 1000)
  }

  const send = async () => {
    if (busy || left > 0 || !email) return
    setBusy(true)
    setError('')
    try {
      const { error: err } = await supabase.auth.resend({ type: 'signup', email })
      if (err) {
        setError(translateAuthError(err.message))
        // A rate-limit answer still means the clock is running.
        startCooldown()
        return
      }
      setSent(true)
      startCooldown()
    } catch (e) {
      setError(translateAuthError(e?.message))
    } finally {
      setBusy(false)
    }
  }

  const disabled = busy || left > 0 || !email
  const label = busy ? t('sending') : left > 0 ? t('wait', { seconds: left }) : t('button')
  return (
    <View style={styles.wrap}>
      <Pressable style={[styles.btn, disabled && styles.off]} onPress={send} disabled={disabled} accessibilityRole="button">
        <RefreshCw size={15} strokeWidth={1.7} color={colors.brand} />
        <Text style={styles.btnText}>{label}</Text>
      </Pressable>
      {sent || error ? (
        <Text style={[styles.hint, error && styles.hintBad]} accessibilityLiveRegion="polite">{error || t('sent')}</Text>
      ) : null}
    </View>
  )
}

const styles = themed((c) => ({
  wrap: { gap: 6 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border },
  btnText: { fontSize: 14, fontWeight: '600', color: c.brand },
  off: { opacity: 0.55 },
  hint: { fontSize: 13, color: c.textSub, textAlign: 'center' },
  hintBad: { color: c.danger },
}))
