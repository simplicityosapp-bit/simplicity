import { View, Text, StyleSheet } from 'react-native'
import { useQuote } from '../../hooks/useQuote'
import Card from '../../components/Card'
import i18n from '../../lib/i18n'
import { colors } from '../../theme/theme'

// Daily system quote — the day-seeded pick from the localized `quotes` pool
// (useQuote), centred in a glass card next to the Moon chip. Personal quotes +
// source picker are a later increment; this shows the system pool + fallback.
export default function QuoteWidget() {
  const { quote } = useQuote()
  return (
    <Card style={styles.card} contentStyle={styles.inner}>
      {quote ? (
        <>
          <Text style={styles.text}>{quote.text}</Text>
          {quote.author ? <Text style={styles.author}>— {quote.author}</Text> : null}
        </>
      ) : (
        <Text style={styles.text}>{i18n.t('home:widgets.quote.fallback')}</Text>
      )}
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { flex: 1 },
  inner: { flex: 1, paddingVertical: 18, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', gap: 6 },
  text: { fontSize: 15, fontWeight: '500', color: colors.text, textAlign: 'center', lineHeight: 21 },
  author: { fontSize: 12, color: colors.textSub, textAlign: 'center' },
})
