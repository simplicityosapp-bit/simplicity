import { useMemo, useState } from 'react'
import { useQuote } from '../../../hooks/useQuote'
import { useUserQuotes } from '../../../hooks/useUserQuotes'
import { useUserPreferences } from '../../../hooks/useUserPreferences'
import QuoteSourceModal from '../../../modals/QuoteSourceModal'
import { useT } from '../../../i18n/useT'
import { Box, Txt } from '../../../components/ui'

/* Daily quote — tap opens the source picker + personal pool manager
   (beta request 03/06/2026). Source: prefs.quoteSource ('system' |
   'personal'). System picks once per session from the `quotes` table;
   personal picks from the user's own pool and falls back to the
   system quote while the pool is still empty. */
/* Resolve a quote to the reader's form of address. System quotes carry
   optional text_male/text_female; personal quotes (and untouched system
   ones) only have `text`, so they fall back cleanly. */
const quoteText = (q, gender) => {
  if (!q) return ''
  if (gender === 'male' && q.text_male) return q.text_male
  if (gender === 'female' && q.text_female) return q.text_female
  return q.text
}

export default function QuoteWidget() {
  const { t, gender } = useT('home')
  const { quote } = useQuote()
  const { userQuotes, addUserQuote, removeUserQuote } = useUserQuotes()
  const { prefs, update } = useUserPreferences()
  const [open, setOpen] = useState(false)

  const source = prefs?.quoteSource === 'personal' ? 'personal' : 'system'

  /* Deterministic daily pick — a day-seeded hash chooses the personal
     quote, so it stays stable across re-renders (pure, lint-safe) and
     rotates naturally once a day. */
  const personalQuote = useMemo(() => {
    if (!userQuotes.length) return null
    const dayKey = new Date().toDateString()
    let h = 0
    for (let i = 0; i < dayKey.length; i++) h = (h * 31 + dayKey.charCodeAt(i)) | 0
    return userQuotes[Math.abs(h) % userQuotes.length]
  }, [userQuotes])

  const shown = (source === 'personal' && personalQuote) ? personalQuote : quote

  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true) }
  }

  return (
    <>
      <Box
        className="h-quote h-quote-btn"
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={onKey}
        aria-label={t('widgets.quote.sourceAria')}
      >
        {shown ? (
          <>
            <Txt as="p" className="h-quote-text">{quoteText(shown, gender)}</Txt>
            {shown.author && <Txt as="p" className="h-quote-author">— {shown.author}</Txt>}
          </>
        ) : (
          <Txt as="p" className="h-quote-text">{t('widgets.quote.fallback')}</Txt>
        )}
      </Box>

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
