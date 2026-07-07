import { useMemo, useState } from 'react'
import { Text, Pressable, StyleSheet } from 'react-native'
import { useQuote } from '../../hooks/useQuote'
import { useUserQuotes } from '../../hooks/useUserQuotes'
import { usePreferences } from '../../lib/preferences'
import Card from '../../components/Card'
import QuoteSourceModal from '../../modals/QuoteSourceModal'
import i18n from '../../lib/i18n'
import { colors } from '../../theme/theme'

// Daily quote — tap opens the source picker + personal pool manager (mirrors web
// QuoteWidget). Source: prefs.quoteSource ('system' | 'personal'). Personal picks
// a day-seeded quote from the user's pool, falling back to the system quote.
const quoteText = (q, gender) => {
  if (!q) return ''
  if (gender === 'male' && q.text_male) return q.text_male
  if (gender === 'female' && q.text_female) return q.text_female
  return q.text
}

export default function QuoteWidget() {
  const { quote } = useQuote()
  const { userQuotes, addUserQuote, removeUserQuote } = useUserQuotes()
  const { prefs, update } = usePreferences()
  const [open, setOpen] = useState(false)
  const gender = prefs.design?.gender
  const source = prefs.quoteSource === 'personal' ? 'personal' : 'system'

  const personalQuote = useMemo(() => {
    if (!userQuotes.length) return null
    const dayKey = new Date().toDateString()
    let h = 0
    for (let i = 0; i < dayKey.length; i++) h = (h * 31 + dayKey.charCodeAt(i)) | 0
    return userQuotes[Math.abs(h) % userQuotes.length]
  }, [userQuotes])

  const shown = (source === 'personal' && personalQuote) ? personalQuote : quote

  return (
    <>
      <Pressable style={styles.press} onPress={() => setOpen(true)} accessibilityLabel={i18n.t('home:widgets.quote.sourceAria', { defaultValue: 'מקור הציטוט' })}>
        <Card style={styles.card} contentStyle={styles.inner}>
          {shown ? (
            <>
              <Text style={styles.text}>{quoteText(shown, gender)}</Text>
              {shown.author ? <Text style={styles.author}>— {shown.author}</Text> : null}
            </>
          ) : (
            <Text style={styles.text}>{i18n.t('home:widgets.quote.fallback')}</Text>
          )}
        </Card>
      </Pressable>

      <QuoteSourceModal
        open={open}
        onClose={() => setOpen(false)}
        source={source}
        onChangeSource={(k) => update({ quoteSource: k })}
        userQuotes={userQuotes}
        onAdd={addUserQuote}
        onRemove={removeUserQuote}
      />
    </>
  )
}

const styles = StyleSheet.create({
  press: { flex: 1 },
  card: { flex: 1 },
  inner: { flex: 1, paddingVertical: 18, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', gap: 6 },
  text: { fontSize: 15, fontWeight: '500', color: colors.text, textAlign: 'center', lineHeight: 21 },
  author: { fontSize: 12, color: colors.textSub, textAlign: 'center' },
})
