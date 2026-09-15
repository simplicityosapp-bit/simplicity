import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { View, ActivityIndicator, Alert } from 'react-native'
import { Send, CheckCircle2 } from 'lucide-react-native'
import Sheet from '../components/Sheet'
import { Text, TextInput } from '../components/Text'
import { Pressable } from '../components/Pressable'
import { useAuth } from '../lib/auth'
import { FEEDBACK_TYPES, submitFeedback, subscribeFeedback, isFeedbackOpen, closeFeedback } from '../lib/feedback'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'

const t = (k, o) => i18n.t(`modalsSystem:feedback.${k}`, o)

/* The feedback sheet — port of web's FeedbackModal: an optional type, free
   text, the privacy hint about client details, and a short thank-you that
   closes itself. Mounted once by <FeedbackHost>; opened with openFeedback(). */
export function FeedbackModal({ open, onClose }) {
  const { session } = useAuth()
  const [message, setMessage] = useState('')
  const [type, setType] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [failed, setFailed] = useState(false)
  const closeTimer = useRef(null)

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  const reset = () => { setMessage(''); setType(null); setDone(false); setFailed(false) }
  const finish = () => { clearTimeout(closeTimer.current); reset(); onClose() }

  /* A half-written message is the one thing on this sheet worth protecting —
     backing out of a long bug report used to be a single stray tap. */
  const requestClose = () => {
    if (busy) return
    if (done || !message.trim()) { finish(); return }
    Alert.alert(
      i18n.t('modalsSystem:discard.title'),
      i18n.t('modalsSystem:discard.message'),
      [
        { text: i18n.t('modalsSystem:discard.cancel'), style: 'cancel' },
        { text: i18n.t('modalsSystem:discard.confirm'), style: 'destructive', onPress: finish },
      ],
    )
  }

  const send = async () => {
    if (!message.trim() || busy) return
    setBusy(true)
    setFailed(false)
    const res = await submitFeedback({ userId: session?.user?.id, message, type })
    setBusy(false)
    if (res.ok) {
      setDone(true)
      closeTimer.current = setTimeout(finish, 1600)
    } else {
      setFailed(true)
    }
  }

  const canSend = !!message.trim() && !busy
  return (
    <Sheet open={open} onClose={requestClose} title={t('title')}>
      {done ? (
        <View style={styles.done} accessibilityLiveRegion="polite">
          <CheckCircle2 size={40} strokeWidth={1.5} color={colors.positive} />
          <Text style={styles.doneText}>{t('thanks')}</Text>
        </View>
      ) : (
        <>
          <Text style={styles.lead}>{t('lead')}</Text>
          <View style={styles.field}>
            <Text style={styles.label}>{t('typeLabel')}</Text>
            <View style={styles.pills}>
              {FEEDBACK_TYPES.map((k) => {
                const on = type === k
                return (
                  <Pressable
                    key={k}
                    style={[styles.pill, on && styles.pillOn]}
                    onPress={() => setType((cur) => (cur === k ? null : k))}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.pillText, on && styles.pillTextOn]}>{t(`types.${k}`)}</Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
          <View>
            <TextInput
              style={styles.input}
              value={message}
              onChangeText={(v) => { setMessage(v); setFailed(false) }}
              placeholder={t('placeholder', { write: t('writeVerb') })}
              placeholderTextColor={colors.textFaint}
              multiline
              textAlignVertical="top"
              editable={!busy}
            />
            <Text style={styles.hint}>{t('privacyHint')}</Text>
          </View>
          {failed ? <Text style={styles.error}>{t('sendFailed')}</Text> : null}
          <Pressable
            style={[styles.btn, !canSend && styles.btnOff]}
            onPress={send}
            disabled={!canSend}
            accessibilityRole="button"
          >
            {busy
              ? <ActivityIndicator color={colors.onBtn} />
              : <Send size={17} strokeWidth={1.7} color={colors.onBtn} />}
            <Text style={styles.btnText}>{busy ? t('sending') : t('send')}</Text>
          </Pressable>
        </>
      )}
    </Sheet>
  )
}

export default function FeedbackHost() {
  const open = useSyncExternalStore(subscribeFeedback, isFeedbackOpen, isFeedbackOpen)
  return <FeedbackModal open={open} onClose={closeFeedback} />
}

const styles = themed((c) => ({
  lead: { fontSize: 14, color: c.textSub, lineHeight: 20 },
  field: { gap: 8 },
  label: { fontSize: 12, fontWeight: '500', color: c.textSub },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { minHeight: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, justifyContent: 'center' },
  pillOn: { backgroundColor: c.brand, borderColor: c.brand },
  pillText: { fontSize: 13, color: c.text },
  pillTextOn: { color: c.onBrand, fontWeight: '600' },
  input: {
    minHeight: 130, borderWidth: 1, borderColor: c.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: c.text, backgroundColor: c.card,
  },
  hint: { fontSize: 12, color: c.textSub, opacity: 0.8, marginTop: 8, lineHeight: 18 },
  error: { fontSize: 13, color: c.danger },
  btn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', minHeight: 48, borderRadius: 12, backgroundColor: c.btnBg },
  btnOff: { opacity: 0.5 },
  btnText: { fontSize: 15, fontWeight: '600', color: c.onBtn },
  done: { alignItems: 'center', gap: 12, paddingVertical: 28 },
  doneText: { fontSize: 15, color: c.text, textAlign: 'center' },
}))
